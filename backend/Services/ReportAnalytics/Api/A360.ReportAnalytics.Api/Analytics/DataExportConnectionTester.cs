using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Cryptography.X509Certificates;
using A360.ReportAnalytics.Api.Contracts;

namespace A360.ReportAnalytics.Api.Analytics;

public sealed record DataExportConnectionCheck(bool Reachable, int? HttpStatus, long? LatencyMs, DateTime? CertificateExpiresAt, string Message);

/// <summary>
/// Tests a connection by calling its base URL over HTTPS (no credentials are sent). Only public addresses are called, so the
/// test cannot be used to probe the internal network. Any HTTP answer counts as reachable; the server certificate must be valid.
/// </summary>
public static class DataExportConnectionTester
{
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(8);

    public static async Task<DataExportConnectionCheck> CheckAsync(string baseUrl, CancellationToken cancellationToken)
    {
        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var url) || url.Scheme != Uri.UriSchemeHttps)
        {
            return new DataExportConnectionCheck(false, null, null, null, "The base URL is not a valid https:// address.");
        }

        DateTime? certificateExpiresAt = null;
        string? certificateProblem = null;
        using var handler = new SocketsHttpHandler
        {
            AllowAutoRedirect = false,
            ConnectTimeout = Timeout,
            UseCookies = false,
            ConnectCallback = async (context, token) =>
            {
                var addresses = await Dns.GetHostAddressesAsync(context.DnsEndPoint.Host, token);
                var allowed = addresses.Where(IsPublic).ToArray();
                if (allowed.Length == 0)
                {
                    throw new HttpRequestException($"{context.DnsEndPoint.Host} does not resolve to a public address.");
                }

                var socket = new Socket(SocketType.Stream, ProtocolType.Tcp) { NoDelay = true };
                try
                {
                    await socket.ConnectAsync(allowed, context.DnsEndPoint.Port, token);
                    return new NetworkStream(socket, ownsSocket: true);
                }
                catch
                {
                    socket.Dispose();
                    throw;
                }
            },
            SslOptions = new SslClientAuthenticationOptions
            {
                RemoteCertificateValidationCallback = (_, certificate, _, errors) =>
                {
                    if (certificate is X509Certificate2 x509)
                    {
                        certificateExpiresAt = x509.NotAfter.ToUniversalTime();
                    }
                    else if (certificate is not null)
                    {
                        certificateExpiresAt = new X509Certificate2(certificate).NotAfter.ToUniversalTime();
                    }

                    if (errors != SslPolicyErrors.None)
                    {
                        certificateProblem = $"the server certificate could not be verified ({errors})";
                        return false;
                    }

                    return true;
                }
            }
        };

        using var client = new HttpClient(handler) { Timeout = Timeout };
        client.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("Asset360-ReportAnalytics", "1.0"));
        var watch = Stopwatch.StartNew();
        try
        {
            using var response = await client.SendAsync(new HttpRequestMessage(HttpMethod.Head, url), HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            watch.Stop();
            var status = (int)response.StatusCode;
            var latency = watch.ElapsedMilliseconds;
            return status >= 500
                ? new DataExportConnectionCheck(true, status, latency, certificateExpiresAt, $"Responded with HTTP {status} in {latency} ms.")
                : new DataExportConnectionCheck(true, status, latency, certificateExpiresAt, $"Reachable: HTTP {status} in {latency} ms.");
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException or SocketException or IOException)
        {
            watch.Stop();
            if (cancellationToken.IsCancellationRequested)
            {
                throw;
            }

            var reason = certificateProblem
                ?? (exception is TaskCanceledException ? $"no answer within {Timeout.TotalSeconds:0} seconds" : Inner(exception).Message);
            return new DataExportConnectionCheck(false, null, null, certificateExpiresAt, $"Unreachable: {reason}");
        }
    }

    /// <summary>Connected, Warning (5xx answer or certificate expiring soon) or Disconnected.</summary>
    public static string StatusOf(DataExportConnectionCheck check, DateTime utcNow)
    {
        if (!check.Reachable)
        {
            return DataExportOptions.DisconnectedStatus;
        }

        var expiring = check.CertificateExpiresAt is { } expires && (expires - utcNow).TotalDays <= DataExportOptions.CertificateWarningDays;
        return check.HttpStatus >= 500 || expiring ? DataExportOptions.WarningStatus : DataExportOptions.ConnectedStatus;
    }

    private static Exception Inner(Exception exception)
    {
        while (exception.InnerException is not null)
        {
            exception = exception.InnerException;
        }

        return exception;
    }

    private static bool IsPublic(IPAddress address)
    {
        if (address.IsIPv4MappedToIPv6)
        {
            address = address.MapToIPv4();
        }

        if (IPAddress.IsLoopback(address) || address.Equals(IPAddress.Any) || address.Equals(IPAddress.IPv6Any) || address.Equals(IPAddress.Broadcast))
        {
            return false;
        }

        if (address.AddressFamily == AddressFamily.InterNetworkV6)
        {
            var bytes6 = address.GetAddressBytes();
            return !(address.IsIPv6LinkLocal || address.IsIPv6SiteLocal || address.IsIPv6Multicast || (bytes6[0] & 0xFE) == 0xFC);
        }

        var b = address.GetAddressBytes();
        return !(b[0] == 10
            || b[0] == 127
            || b[0] == 0
            || b[0] == 169 && b[1] == 254
            || b[0] == 172 && b[1] >= 16 && b[1] <= 31
            || b[0] == 192 && b[1] == 168
            || b[0] == 100 && b[1] >= 64 && b[1] <= 127
            || b[0] >= 224);
    }
}
