import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ImportColumn, ImportFileModal } from 'shared-ui';
import { RowActions } from 'shared-ui';

export interface AlertIncidentEntry {
  assetId: string;
  assetName: string;
  alertType: string;
  incidentReports: string;
  damageReports: string;
  theftLossRecords: string;
  resolutionStatus: string;
}

export interface AlertIncidentForm {
  assetId: string;
  assetName: string;
  alertType: string;
  incidentReports: string;
  damageReports: string;
  theftLossRecords: string;
  resolutionStatus: string;
}

@Component({
  standalone: true,
  selector: 'app-asset-alert-incident',
  imports: [CommonModule, FormsModule, ImportFileModal, RowActions],
  templateUrl: './alert-incident.html',
  styleUrls: ['./alert-incident.css']
})
export class AssetAlertIncident {
  readonly importColumns: ImportColumn[] = [
    { key: 'assetId', label: 'Asset ID' },
    { key: 'assetName', label: 'Asset Name' },
    { key: 'alertType', label: 'Alert Type' },
    { key: 'incidentReports', label: 'Incident Reports' },
    { key: 'damageReports', label: 'Damage Reports' },
    { key: 'theftLossRecords', label: 'Theft / Loss Records' },
    { key: 'resolutionStatus', label: 'Resolution Status' }
  ];

  showImportModal = false;

  // Master: alert type (geofence breach, low battery, etc.)
  alertTypeOptions: string[] = [
    'Geofence Breach',
    'Low Battery',
    'Unauthorized Movement',
    'Temperature Threshold',
    'Tamper Alert'
  ];

  // Master: resolution status
  resolutionStatusOptions: string[] = ['Open', 'In Progress', 'Resolved', 'Closed'];

  entries: AlertIncidentEntry[] = [
    {
      assetId: 'AST-0001',
      assetName: 'Forklift Unit 8',
      alertType: 'Geofence Breach',
      incidentReports: 'Forklift FL-08 exited designated zone',
      damageReports: '-',
      theftLossRecords: '-',
      resolutionStatus: 'Open'
    },
    {
      assetId: 'AST-0002',
      assetName: 'GPS Tracker Unit 12',
      alertType: 'Low Battery',
      incidentReports: 'Tracker battery below 10%',
      damageReports: '-',
      theftLossRecords: '-',
      resolutionStatus: 'Resolved'
    }
  ];

  showFormModal = false;
  isEditMode = false;
  private editingEntry: AlertIncidentEntry | null = null;
  form: AlertIncidentForm = this.emptyForm();

  private emptyForm(): AlertIncidentForm {
    return {
      assetId: '',
      assetName: '',
      alertType: '',
      incidentReports: '',
      damageReports: '',
      theftLossRecords: '',
      resolutionStatus: ''
    };
  }

  onAdd(): void {
    this.isEditMode = false;
    this.editingEntry = null;
    this.form = this.emptyForm();
    this.showFormModal = true;
  }

  onUpload(): void {
    this.showImportModal = true;
  }

  onImportRows(rows: Record<string, string>[]): void {
    this.entries = [
      ...this.entries,
      ...rows.map((row) => ({
        assetId: row['assetId'] ?? '',
        assetName: row['assetName'] ?? '',
        alertType: row['alertType'] ?? '',
        incidentReports: row['incidentReports'] ?? '',
        damageReports: row['damageReports'] ?? '',
        theftLossRecords: row['theftLossRecords'] ?? '',
        resolutionStatus: row['resolutionStatus'] ?? ''
      }))
    ];
    this.showImportModal = false;
  }

  onDownload(): void {
    // TODO: export current alert & incident list
  }

  onRefresh(): void {
    // TODO: reload alert & incident data from backend
  }

  onDelete(): void {
    // TODO: delete selected entries
  }

  editRow(entry: AlertIncidentEntry): void {
    this.isEditMode = true;
    this.editingEntry = entry;
    this.form = {
      assetId: entry.assetId,
      assetName: entry.assetName,
      alertType: entry.alertType,
      incidentReports: entry.incidentReports,
      damageReports: entry.damageReports,
      theftLossRecords: entry.theftLossRecords,
      resolutionStatus: entry.resolutionStatus
    };
    this.showFormModal = true;
  }

  closeFormModal(): void {
    this.showFormModal = false;
    this.editingEntry = null;
  }

  submitForm(): void {
    if (this.isEditMode && this.editingEntry) {
      Object.assign(this.editingEntry, this.form);
    } else {
      this.entries = [...this.entries, { ...this.form }];
    }
    this.closeFormModal();
  }

  deleteRow(entry: AlertIncidentEntry): void {
    this.entries = this.entries.filter((e) => e !== entry);
  }
}
