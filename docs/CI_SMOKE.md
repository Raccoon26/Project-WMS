# CI Guarded Auto-Merge Smoke Test

This harmless documentation-only DEV-00 PR verifies the end-to-end GitHub Actions flow after bootstrap: a current-head successful WMS PR CI run may trigger trusted auto-merge without branch protection. No inventory, payments, emails, operational credentials or deployments are involved.

Do not treat this as a test of real WMS business behavior. Audit the GitHub Actions run and PR merge commit to confirm the behavior before asserting success.
