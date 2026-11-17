using System.Globalization;
using System.Text;
using System.Text.Json;
using ClosedXML.Excel;
using A360.ReportAnalytics.Api.Contracts;
using A360.ReportAnalytics.Repository.Reporting;

namespace A360.ReportAnalytics.Api.Analytics;

public sealed record DataExportFile(byte[] Content, string ContentType, string Extension);

/// <summary>Writes dataset rows as CSV, Excel or JSON. Dates are shown in the job's time zone (JSON keeps UTC ISO 8601).</summary>
public static class DataExportFileWriter
{
    public const string CsvContentType = "text/csv";
    public const string XlsxContentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    public const string JsonContentType = "application/json";

    public static DataExportFile Write(string format, IReadOnlyList<DataExportDatasetField> fields, IReadOnlyList<object?[]> rows, TimeZoneInfo zone, string sheetName)
    {
        return format.ToUpperInvariant() switch
        {
            "XLSX" => new DataExportFile(Xlsx(fields, rows, zone, sheetName), XlsxContentType, "xlsx"),
            "JSON" => new DataExportFile(Json(fields, rows), JsonContentType, "json"),
            _ => new DataExportFile(Csv(fields.Select(field => field.Name).ToList(), rows.Select(row => row.Select(value => Cell(value, zone)).ToArray()).ToList()), CsvContentType, "csv")
        };
    }

    /// <summary>CSV with a UTF-8 BOM so Excel opens it with the right encoding.</summary>
    public static byte[] Csv(IReadOnlyList<string> header, IEnumerable<string?[]> rows)
    {
        var builder = new StringBuilder();
        builder.AppendLine(string.Join(',', header.Select(Escape)));
        foreach (var row in rows)
        {
            builder.AppendLine(string.Join(',', row.Select(Escape)));
        }

        return Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(builder.ToString())).ToArray();
    }

    public static byte[] Xlsx(string sheetName, IReadOnlyList<string> header, IEnumerable<object?[]> rows)
    {
        using var workbook = new XLWorkbook();
        var sheet = workbook.AddWorksheet(SheetName(sheetName));
        for (var column = 0; column < header.Count; column++)
        {
            sheet.Cell(1, column + 1).Value = header[column];
        }

        sheet.Row(1).Style.Font.Bold = true;
        var rowIndex = 2;
        foreach (var row in rows)
        {
            for (var column = 0; column < row.Length; column++)
            {
                var cell = sheet.Cell(rowIndex, column + 1);
                switch (row[column])
                {
                    case null:
                        break;
                    case DateTime date:
                        cell.Value = date;
                        cell.Style.DateFormat.Format = "yyyy-mm-dd hh:mm";
                        break;
                    case double number:
                        cell.Value = number;
                        break;
                    case long number:
                        cell.Value = number;
                        break;
                    case int number:
                        cell.Value = number;
                        break;
                    default:
                        // Written as text, so a value such as "=1+1" is never evaluated as a formula.
                        cell.Value = row[column]!.ToString();
                        break;
                }
            }

            rowIndex++;
        }

        sheet.Columns().AdjustToContents(1, Math.Min(rowIndex, 500));
        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return stream.ToArray();
    }

    /// <summary>Text for a CSV cell or preview: dates as local "yyyy-MM-dd HH:mm", numbers in invariant culture.</summary>
    public static string? Cell(object? value, TimeZoneInfo zone) => value switch
    {
        null => null,
        DateTime date => TimeZoneInfo.ConvertTimeFromUtc(DataExportTime.Utc(date), zone).ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture),
        double number => number.ToString(CultureInfo.InvariantCulture),
        _ => value.ToString()
    };

    private static byte[] Xlsx(IReadOnlyList<DataExportDatasetField> fields, IReadOnlyList<object?[]> rows, TimeZoneInfo zone, string sheetName) =>
        Xlsx(sheetName, fields.Select(field => field.Name).ToList(), rows.Select(row => row
            .Select(value => value is DateTime date ? TimeZoneInfo.ConvertTimeFromUtc(DataExportTime.Utc(date), zone) : value)
            .ToArray()));

    private static byte[] Json(IReadOnlyList<DataExportDatasetField> fields, IReadOnlyList<object?[]> rows)
    {
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream, new JsonWriterOptions { Indented = false }))
        {
            writer.WriteStartArray();
            foreach (var row in rows)
            {
                writer.WriteStartObject();
                for (var column = 0; column < fields.Count; column++)
                {
                    writer.WritePropertyName(fields[column].Name);
                    switch (row[column])
                    {
                        case null:
                            writer.WriteNullValue();
                            break;
                        case DateTime date:
                            writer.WriteStringValue(DataExportTime.Utc(date).ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture));
                            break;
                        case double number when double.IsFinite(number):
                            writer.WriteNumberValue(number);
                            break;
                        default:
                            writer.WriteStringValue(row[column]!.ToString());
                            break;
                    }
                }

                writer.WriteEndObject();
            }

            writer.WriteEndArray();
        }

        return stream.ToArray();
    }

    private static string Escape(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        // Spreadsheet formula injection: a cell starting with = + - @ is kept as text.
        if (value[0] is '=' or '+' or '@' or '\t' or '\r' || value[0] == '-' && !double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out _))
        {
            value = "'" + value;
        }

        return value.IndexOfAny([',', '"', '\n', '\r']) >= 0 ? $"\"{value.Replace("\"", "\"\"")}\"" : value;
    }

    private static string SheetName(string name)
    {
        var clean = new string(name.Where(character => !"[]:*?/\\".Contains(character)).ToArray()).Trim();
        return string.IsNullOrEmpty(clean) ? "Export" : clean.Length > 31 ? clean[..31] : clean;
    }
}

/// <summary>Next run of a scheduled export, from its frequency and "time" value, in the job's time zone.</summary>
public static class DataExportSchedule
{
    public static DateTime? NextRun(string frequency, string time, string? status, TimeZoneInfo zone, DateTime utcNow)
    {
        if (status is DataExportOptions.PausedStatus or DataExportOptions.DraftStatus)
        {
            return null;
        }

        var local = TimeZoneInfo.ConvertTimeFromUtc(utcNow, zone);
        DateTime candidate;
        switch (frequency)
        {
            case DataExportOptions.HourlyFrequency when int.TryParse(time, out var minute):
                candidate = new DateTime(local.Year, local.Month, local.Day, local.Hour, minute, 0);
                if (candidate <= local)
                {
                    candidate = candidate.AddHours(1);
                }

                break;
            case DataExportOptions.DailyFrequency when TimeOnly.TryParseExact(time, "HH:mm", out var clock):
                candidate = local.Date + clock.ToTimeSpan();
                if (candidate <= local)
                {
                    candidate = candidate.AddDays(1);
                }

                break;
            case DataExportOptions.WeeklyFrequency:
                var parts = time.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                var day = parts.Length == 2 ? Array.IndexOf(DataExportOptions.Weekdays, parts[0]) : -1;
                if (day < 0 || !TimeOnly.TryParseExact(parts[1], "HH:mm", out var weeklyClock))
                {
                    return null;
                }

                // Weekdays start on Monday; DayOfWeek starts on Sunday.
                var target = (DayOfWeek)((day + 1) % 7);
                candidate = local.Date.AddDays(((int)target - (int)local.DayOfWeek + 7) % 7) + weeklyClock.ToTimeSpan();
                if (candidate <= local)
                {
                    candidate = candidate.AddDays(7);
                }

                break;
            case DataExportOptions.MonthlyFrequency when TimeOnly.TryParseExact(time, "HH:mm", out var monthlyClock):
                // Monthly exports run on the 1st of the month.
                candidate = new DateTime(local.Year, local.Month, 1) + monthlyClock.ToTimeSpan();
                if (candidate <= local)
                {
                    candidate = candidate.AddMonths(1);
                }

                break;
            default:
                return null;
        }

        candidate = DateTime.SpecifyKind(candidate, DateTimeKind.Unspecified);
        // A local time skipped by a daylight-saving change runs an hour later.
        return zone.IsInvalidTime(candidate) ? TimeZoneInfo.ConvertTimeToUtc(candidate.AddHours(1), zone) : TimeZoneInfo.ConvertTimeToUtc(candidate, zone);
    }
}
