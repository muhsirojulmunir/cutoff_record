# Design Specification: Clean Starter System (Koding Cutoff)

**Date**: 2026-10-23  
**Status**: Approved by User  
**Target Database**: `koding_cutoff`  
**Theme**: Clean White & Navy Blue  

---

## 1. Overview & Objective

The user cloned this repository (`koding-cutoff`) from an existing ERP project and wants to repurpose it into a new system.  
The objective is to establish a **clean, production-ready starter baseline** by:
1. Safely disconnecting from the existing `koding_erp` database and targeting `koding_cutoff`.
2. Preserving the full authentication system (Login, Logout, Session, User Management, Role & Permission structure).
3. Archiving old ERP-specific migrations (70+ tables) and keeping only core auth and system tables.
4. Cleaning up `routes/web.php` to remove old business routes while maintaining authentication, dashboard, and settings.
5. Updating the visual theme from the previous dark slate palette to an elegant **White & Navy Blue** corporate theme across AppLayout, Login, and Dashboard.

---

## 2. Architecture & Database Changes

### 2.1 Environment Configuration (`.env`)
- `APP_NAME="Koding App"`
- `DB_DATABASE=koding_cutoff`
- Ensure credentials connect to MySQL safely without affecting the original `koding_erp` database.

### 2.2 Migrations Cleanup & Archiving
- Create backup directory `database/migrations_erp_backup/`.
- Move all business-specific ERP migrations into `database/migrations_erp_backup/`.
- Retain only core system migrations in `database/migrations/`:
  - `0001_01_01_000000_create_users_table.php` (Users, password reset tokens, sessions)
  - `0001_01_01_000001_create_cache_table.php` (Cache & cache locks)
  - `0001_01_01_000002_create_jobs_table.php` (Queues & failed jobs)
  - `2026_07_26_100000_create_roles_permissions_tables.php` (Roles, permissions, role_permission, user_permission)
  - `2026_07_26_100001_add_role_id_and_status_to_users_table.php` (Role relation on users)
  - `2026_07_31_100000_add_soft_deletes_to_users_table.php` (User soft deletes)

### 2.3 Database Seeding (`DatabaseSeeder.php`)
- Retain a lean, self-contained `RoleAndPermissionSeeder`:
  - Roles: `Super Admin`, `Admin`, `User`
  - Core permissions: `dashboard.view`, `user.view`, `user.create`, `user.edit`, `user.delete`, `role.view`
  - Default user:
    - Name: `Super Admin`
    - Email: `superadmin@company.com`
    - Password: `password` (hashed)
    - Role: `Super Admin`
    - Status: `active`
- Command to run: create DB `koding_cutoff` if not exists, then `php artisan migrate:fresh --seed`.

---

## 3. Backend & Routing (`routes/web.php`)

### 3.1 Retained Routes
- **Guest**:
  - `GET /login` -> `LoginController@showLoginForm` (`name('login')`)
  - `POST /login` -> `LoginController@login`
- **Authenticated (`auth` middleware)**:
  - `POST /logout` -> `LoginController@logout` (`name('logout')`)
  - `GET /` -> Redirect to `/dashboard`
  - `GET /dashboard` -> `DashboardController` (`name('dashboard')`)
  - `Resource /users` -> `UserController` (`except(['show'])`, permissions guarded)
  - `GET /roles` -> `RoleController@index` (`name('roles.index')`)

### 3.2 Purged Routes
- Remove all ERP controllers and routes:
  - Sales Orders, Purchase Orders, Suppliers, Customers, Warehouses, Products, Categories
  - Invoices, Payments, Petty Cash, Cash & Bank Accounts, Fund Allocations
  - Marketplace accounts/orders/mappings/sync
  - Goods receipts, Stock adjustments, Warehouse dispatch, Stock movements, Stock returns
  - All report routes (`/reports/*`)

### 3.3 Dashboard Controller (`DashboardController.php`)
- Decouple from `DashboardReportService`.
- Provide dashboard metadata:
  - Current authenticated user info and permissions
  - Active user count and roles summary
  - System status indicator (database connected, environment, app version)

---

## 4. UI & Design System: White & Navy Blue

### 4.1 Color Palette
- **Background**: Pure white (`#ffffff` / `bg-white`) and subtle slate tint (`#f8fafc` / `bg-slate-50`)
- **Primary / Brand (Navy Blue)**:
  - Deep Navy: `#0f172a` / `#1e293b` / `#1e3a8a`
  - Navy Accent: `#1d4ed8` / `#2563eb`
  - Navy Soft/Tints: `#eff6ff` / `#dbeafe`
- **Borders & Dividers**: `border-slate-200`
- **Typography**:
  - Headings & primary text: `text-slate-900`
  - Secondary text: `text-slate-500` / `text-slate-600`
- **Badges & Accents**: Emerald (`#10b981`) for active/online status, Amber (`#f59e0b`) for warnings.

### 4.2 AppLayout (`resources/js/Layouts/AppLayout.tsx`)
- Sidebar styling:
  - Clean Deep Navy / Blue slate sidebar (`bg-[#0f172a]` or crisp white with navy active accents).
  - Main content area: crisp white (`bg-slate-50` with `bg-white` cards and `border-slate-200`).
- Sidebar menu items:
  - **Menu Utama**: Dashboard (`/dashboard`)
  - **Pengaturan**: User Management (`/users`), Role & Permission (`/roles`)
- Header: Pure white (`bg-white border-b border-slate-200`) with user profile, role badge, and logout dropdown.

### 4.3 Login Page (`resources/js/Pages/Auth/Login.tsx`)
- Clean white card with navy blue header / logo branding and navy primary button (`bg-blue-900 hover:bg-blue-800`).
- Crisp input fields with subtle borders and navy focus rings.

### 4.4 Dashboard Page (`resources/js/Pages/Dashboard.tsx`)
- Modern clean welcome card with greeting to logged-in user.
- Status cards:
  - Total Active Users
  - Active Roles & Permissions
  - Database status (`koding_cutoff` Connected)
  - Quick actions (e.g. Manage Users, Add New Module)
- Empty state container / placeholder ready for user's upcoming features.

---

## 5. Testing & Verification

1. **Database Migration & Seed**: Verify `php artisan migrate:fresh --seed` runs with 0 errors on `koding_cutoff`.
2. **Auth Verification**: Test login with `superadmin@company.com` / `password`.
3. **Route & Inertia Rendering**: Verify `/dashboard`, `/users`, `/roles` render without missing prop/table errors.
4. **TypeScript Verification**: Run `npx tsc --noEmit` to ensure no broken types or references across the application.
