import { Component, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgFor, NgIf } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import {
  ArrowRight,
  AtSign,
  BadgeCheck,
  Box,
  ChartColumn,
  ChevronDown,
  Eye,
  EyeOff,
  Lock,
  LucideAngularModule,
  Mail,
  Phone,
  ShieldCheck,
  User,
  Wrench,
} from 'lucide-angular';
import { AuthService, RegisterData, SignupRole } from 'shared-ui';

const USER_NAME_PATTERN = /^[A-Za-z0-9._-]{3,50}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
/** Same design canvas as the sign-in page, so both pages scale the same way. */
const DESIGN_H = 940;
const DESIGN_MIN_W = 1280;

/** Sign-up: creates the account on the server (POST /api/auth/register); afterwards the user signs in. */
@Component({
  standalone: true,
  selector: 'app-signup',
  imports: [FormsModule, NgIf, NgFor, RouterLink, LucideAngularModule],
  templateUrl: './signup.html',
  // The sign-in page's layout, branding and controls, plus the sign-up form's own parts
  styleUrls: ['../../login/login/login.css', './signup.css']
})
export class Signup {
  readonly icons = { ArrowRight, AtSign, BadgeCheck, ChevronDown, Eye, EyeOff, Lock, Mail, Phone, User };
  readonly features = [
    { label: 'Asset\nVisibility', icon: Box, tone: 'purple' },
    { label: 'Maintenance\nManagement', icon: Wrench, tone: 'teal' },
    { label: 'Operational\nEfficiency', icon: ChartColumn, tone: 'blue' },
    { label: 'Compliance\n& Governance', icon: ShieldCheck, tone: 'green' },
  ];
  readonly year = new Date().getFullYear();

  form: RegisterData = { fullName: '', userName: '', email: '', contactNo: '', password: '', userRoleId: '' };
  confirmPassword = '';
  errorMsg = '';
  isLoading = false;
  showPassword = false;
  showConfirm = false;

  roles: SignupRole[] = [];
  rolesLoading = false;
  rolesError = '';

  /** Desktop / laptop: laid out at the design size and scaled to fit, as on the sign-in page. */
  scaled = false;
  scale = 1;

  constructor(private auth: AuthService, private router: Router) {
    this.fit();
    this.loadRoles();
  }

  @HostListener('window:resize')
  fit(): void {
    if (typeof window === 'undefined') return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.scaled = w >= 1000 && w >= h;
    this.scale = this.scaled ? Math.min(h / DESIGN_H, w / DESIGN_MIN_W) : 1;
  }

  get selectedRole(): SignupRole | undefined {
    return this.roles.find((r) => r.roleId === this.form.userRoleId);
  }

  /** GET /api/auth/roles: the roles a new account may choose. */
  loadRoles(): void {
    this.rolesLoading = true;
    this.rolesError = '';
    this.auth.getSignupRoles().subscribe({
      next: (roles) => {
        this.roles = roles ?? [];
        this.rolesLoading = false;
      },
      error: (err) => {
        this.rolesLoading = false;
        this.rolesError = this.auth.errorMessage(err, 'Could not load roles.');
      },
    });
  }

  private validate(): string | null {
    const f = this.form;
    if (!f.fullName.trim() || !f.userName.trim() || !f.email.trim() || !f.password) return 'Please fill in all required fields.';
    if (!USER_NAME_PATTERN.test(f.userName.trim())) return 'Username must be 3-50 characters: letters, numbers, dot, dash or underscore.';
    if (!EMAIL_PATTERN.test(f.email.trim())) return 'Enter a valid email address.';
    if (f.password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
    if (f.password !== this.confirmPassword) return 'Passwords do not match.';
    if (!f.userRoleId) return 'Select a role.';
    return null;
  }

  /** POST /api/auth/register, then on to sign-in with the new username filled in. */
  signup(): void {
    this.errorMsg = this.validate() ?? '';
    if (this.errorMsg || this.isLoading) return;

    const userName = this.form.userName.trim();
    this.isLoading = true;
    this.auth
      .register({
        fullName: this.form.fullName.trim(),
        userName,
        email: this.form.email.trim(),
        contactNo: this.form.contactNo.trim(),
        password: this.form.password,
        userRoleId: this.form.userRoleId,
      })
      .subscribe({
        next: () => {
          this.isLoading = false;
          this.router.navigate(['/login'], { queryParams: { registered: userName } });
        },
        error: (err) => {
          this.isLoading = false;
          this.errorMsg = this.auth.errorMessage(err, 'Could not create the account.');
        },
      });
  }
}
