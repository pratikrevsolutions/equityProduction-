# Equity Medical — Production Metadata Backup

This repository is a full metadata backup of the Salesforce org below, retrieved read-only via the Salesforce CLI.

- **Org:** Equity Medical (alias `Production`, org ID `00Dfn00000DtANTEA3`)
- **Instance:** drive-drive-2409.my.salesforce.com
- **Backup date:** 2026-11-06
- **Retrieved by:** Salesforce CLI (`@salesforce/cli` 2.153.5), source format, into `force-app/main/default/`

## What was retrieved

Every metadata type with components present in the org (discovered via `sf project generate manifest --from-org Production`), excluding managed package components. This includes:

- Full data model: custom/standard objects, fields, record types, validation rules, list views, compact layouts, field sets, custom metadata types and records, custom settings, duplicate/matching rules
- All Apex classes, pages, triggers-equivalent, Lightning Web Components, Aura bundles, static resources
- Automation: Flows, Workflow rules, Approval Processes, Assignment/Auto-Response/Escalation rules
- UI: Layouts, FlexiPages, Custom Apps/Tabs, Quick Actions, Path Assistants
- Security: Profiles, Permission Sets, Permission Set Groups, Roles, Groups, Queues, Sharing Rules
- Experience Cloud: Digital Experience bundles/configs, Networks, Audiences, Navigation Menus
- Integration: Auth Providers, Remote Site Settings, External Client Apps/OAuth settings, External Data Sources
- Reports, Dashboards, Email Templates, and their folder structure (including the org's "Public Reports" / `unfiled$public` system folder, which required separate explicit-member enumeration — see note below)
- Org-wide Settings, Content Assets, Translations

Custom settings **data** (not just schema): queried via Tooling API for all custom settings objects; only `Migration_Mode__c` is unmanaged (the rest — `report_sender__*`, `metacapi__*`, `p0pFD__*` — belong to installed managed packages and were excluded per the managed-package exclusion rule). `Migration_Mode__c` had 0 stored records at backup time.

## What's NOT included (and why)

- **Managed package components** — excluded by design (default behavior of `sf project generate manifest --from-org`).
- **Secrets** — Named Credential passwords/tokens, Connected App client secrets, and Certificate private keys are **never exposed by the Salesforce Metadata API**, so they cannot be included in this or any metadata backup. These must be reconfigured manually if this backup is ever used to rebuild an org.
- **Documents**: the org has zero Document records, so no files were retrieved for this type (confirmed, not a gap).

## Known gaps / follow-ups

- Report/Dashboard/EmailTemplate retrieval required a two-pass approach: a plain wildcard retrieve reports "succeeded" but silently returns zero components for folder-based types, and the default "Public Reports" folder (`unfiled$public`) isn't returned by a standard folder query at all. This backup enumerates each folder's actual contents explicitly (see `scripts/` and `manifest/folder-items-package.xml`) rather than relying on wildcards. If reports/dashboards are added to the org later, **re-run the folder enumeration step**, not just a plain wildcard retrieve, or newly added items may be silently missed.
- This was a single point-in-time backup; it is not wired up to run automatically. Re-run the scripts below periodically or on a schedule if ongoing backups are wanted.

## How to re-run this backup

```sh
# 1. Re-authenticate if needed
sf org login web --alias Production --instance-url https://login.salesforce.com

# 2. Regenerate the manifest of everything present in the org
sf project generate manifest --from-org Production --name full --output-dir manifest

# 3. Retrieve everything except security types (Profile/PermissionSet/PermissionSetGroup/MutingPermissionSet)
bash scripts/retrieve-all.sh

# 4. Retrieve security types together with what they secure (FLS/object/tab visibility)
bash scripts/retrieve-security.sh

# 5. Folder-based types (Report/Dashboard/Document/EmailTemplate) need explicit enumeration —
#    see the "Known gaps" note above. This step is not yet fully scripted end-to-end;
#    follow the approach in manifest/folder-items-package.xml as a reference.
```

All of the above is **read-only against the org** — nothing in this process deploys, modifies, or deletes anything in Production.

---

# Salesforce DX Project

Salesforce DX is a development approach that brings source-driven development, team collaboration, and continuous integration to the Salesforce Platform. Instead of working directly in an org through a web browser, you work with metadata as source files in a local DX project, track changes in version control, and deploy through automated processes.

This project template gets you started with the tools and structure you need to build Salesforce applications using source control, scratch orgs, and the Salesforce CLI.

## Prerequisites

Before you start, make sure you have:

- **Salesforce CLI** - Download from [developer.salesforce.com/tools/salesforcecli](https://developer.salesforce.com/tools/salesforcecli). See [Install Salesforce CLI](https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_setup_install_cli.htm) for details.
- **VS Code with Salesforce Extension Pack** - See [Installation Instructions](https://developer.salesforce.com/docs/platform/sfvscode-extensions/guide/install.html) for details. Includes the Agentforce Vibes extension.
- **A development org** - Sign up for a free Developer Edition org [here](https://developer.salesforce.com/signup).
- **Dev Hub enabled** (optional, required to create scratch orgs) - You can enable Dev Hub in your development org under Setup > Dev Hub.  See [Provide Developers Access to Salesforce DX Tools](https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/sfdx_setup_dx_tools.htm).

## Project Structure

Your DX project follows this structure:

- **`force-app/main/default/`** - Your metadata source files live in this default package directory. You can configure additional package directories in the `sfdx-project.json` file.
- **`config/`** - Scratch org definitions and project settings
- **`scripts/`** - Automation scripts for common tasks
- **`sfdx-project.json`** - Project manifest that defines package directories, namespace, API version, and other project-level settings

See [Salesforce DX Project Configuration](https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/sfdx_dev_ws_config.htm).

## Get Started

Ready to start developing? The [Get Started with Salesforce DX](https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/sfdx_dev_get_started_dx.htm) guide walks you through your first project, from creating a scratch org to creating a simple Apex class or LWC to deploying your code to a sandbox.

## Common Salesforce CLI Commands

Here are common CLI commands that you'll use the most:

- `sf org login web`: Authorize an org
- `sf org open`: Open your org in a browser
- `sf org create scratch`: Create a scratch org
- `sf project deploy start`: Deploy metadata to your org
- `sf project retrieve start`: Retrieve metadata from your org
- `sf template generate <artifact>`: Scaffold new components, such as Apex classes and triggers, LWC components, Lightning apps, and more
- `sf apex <command>`: Run Apex tests, run anonymous Apex blocks, and view logs
- `sf data <command>`: Work with test data
- `sf alias <command>`: Manage org aliases
- `sf config <command>`: Configure CLI settings

## Use Agentforce Vibes to Build Lightning Apps

Transform your ideas into custom Lightning apps that extend CRM workflows directly in Lightning Experience. Through natural conversations with Agentforce Vibes, implement custom objects and fields, complex business logic, and dynamic UI components. See [Build a Lightning App Using Agentforce Vibes](https://developer.salesforce.com/docs/platform/einstein-for-devs/guide/lexapp-overview.html).

## Additional Resources

- [Agentforce Vibes Developer Guide](https://developer.salesforce.com/docs/platform/einstein-for-devs/guide/einstein-overview.html)
- [Salesforce CLI Installation Guide](https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_setup_intro.htm)
- [Salesforce DX Developer Guide](https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/)
- [Salesforce CLI Command Reference](https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference/)
- [Salesforce CLI Plugin Development Guide](https://developer.salesforce.com/docs/platform/salesforce-cli-plugin/guide/conceptual-overview.html)
- [Salesforce VS Code Extensions Documentation](https://developer.salesforce.com/tools/vscode/)

