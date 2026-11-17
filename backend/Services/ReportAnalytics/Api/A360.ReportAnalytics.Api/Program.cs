using A360.ReportAnalytics.Api.IoC;
using A360.ReportAnalytics.Api.Middlewares;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy
            .AllowAnyOrigin()
            .AllowAnyMethod()
            .AllowAnyHeader();
    });
});

builder.Services.AddReportAnalyticsApiServices(builder.Configuration);

var app = builder.Build();

app.UseCors("AllowAll");

app.UseReportAnalyticsApiMiddlewares();

await app.RunAsync();
