using MongoDB.Bson.Serialization.Attributes;
using A360.Domain.Entities;

namespace A360.ReportAnalytics.Domain.Entities;

/// <summary>
/// A CAPEX request raised for an asset replacement or purchase, decided from Financial Analytics (CAPEX Approvals).
/// Status is Pending, More Info Requested, Approved or Rejected; the first two count as pending approval.
/// </summary>
[BsonIgnoreExtraElements]
public sealed class FinancialAnalyticsCapexRequest : BaseEntity
{
    // Business identifier exposed to clients (e.g. CPX-2026-0001); kept separate from the Mongo _id.
    [BsonElement("request_id")]
    public string RequestId { get; set; } = string.Empty;

    [BsonElement("title")]
    public string Title { get; set; } = string.Empty;

    // The asset the request replaces or extends, as its business id or Mongo _id; optional for new purchases.
    [BsonElement("asset_id")]
    public string? AssetId { get; set; }

    [BsonElement("asset_name")]
    public string? AssetName { get; set; }

    [BsonElement("location")]
    public string? Location { get; set; }

    [BsonElement("category")]
    public string? Category { get; set; }

    [BsonElement("cost_center")]
    public string? CostCenter { get; set; }

    [BsonElement("amount")]
    public double Amount { get; set; }

    [BsonElement("currency")]
    public string? Currency { get; set; }

    [BsonElement("justification")]
    public string? Justification { get; set; }

    [BsonElement("requested_by")]
    public string? RequestedBy { get; set; }

    [BsonElement("submitted_at")]
    public DateTime SubmittedAt { get; set; }

    // Every decision taken on the request, oldest first.
    [BsonElement("decisions")]
    public List<FinancialAnalyticsCapexDecision> Decisions { get; set; } = [];
}

[BsonIgnoreExtraElements]
public sealed class FinancialAnalyticsCapexDecision
{
    // Approve, Reject or Request more information.
    [BsonElement("decision")]
    public string Decision { get; set; } = string.Empty;

    [BsonElement("approver")]
    public string? Approver { get; set; }

    [BsonElement("comments")]
    public string? Comments { get; set; }

    [BsonElement("decided_by")]
    public string? DecidedBy { get; set; }

    [BsonElement("decided_at")]
    public DateTime DecidedAt { get; set; }
}
