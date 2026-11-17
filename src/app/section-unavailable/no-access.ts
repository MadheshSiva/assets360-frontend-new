import { Component } from '@angular/core';

/** Shown when the signed-in user's roles don't allow any section. */
@Component({
  standalone: true,
  selector: 'app-no-access',
  template: `
    <div class="no-access">
      <h2>You don't have access to any modules yet</h2>
      <p>Your role doesn't include any modules. Ask an administrator to update your role in Role &amp; Access Control.</p>
    </div>
  `,
  styles: [`
    .no-access {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 80px 24px;
      text-align: center;
      color: #6b6478;
    }
    .no-access h2 {
      margin: 0;
      color: #211d2b;
      font-size: 20px;
    }
    .no-access p {
      margin: 0;
    }
  `]
})
export class NoAccess {}
