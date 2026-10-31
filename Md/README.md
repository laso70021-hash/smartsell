# DukaPro — Complete Product Documentation Package

This ZIP consolidates the **user-supplied DukaPro dashboard screenshots** and the **10-panel product showcase** into a unified product specification. It does **not** claim to contain or modify the existing application source code.

## Contents
- `PRD.md` — complete functional requirements and user roles
- `ARCHITECTURE.md` — system topology, recommended source tree, domain data model, workflows and authorization
- `DESIGN.md` — sampled dark UI colors, light alternative and detailed screen design contracts
- `RULES.md` — implementation and security requirements
- `TASKS.md` — phased implementation checklist
- `MEMORY.md` — durable project decisions and unresolved validations
- `assets/DukaPro_Retail_Dashboard_Showcase.png` — original combined ten-panel reference
- `assets/Dark_Reference_*.png` — supplied individual dark UI references
- `assets/10_Reference_Screens/` — the original ten individual composite-panel references
- `assets/dukapro_color_palette.png` — extracted/reference design swatches

## How to use in Lovable
1. Upload all six `.md` files and the relevant reference images to the **existing DukaPro project**.
2. Instruct Lovable to inspect the current repository and database first, then use `PRD.md` for scope, `ARCHITECTURE.md` for structural guidance, `DESIGN.md` for visuals, `RULES.md` for constraints, `TASKS.md` for sequencing and `MEMORY.md` for persistent decisions.
3. Implement one verified phase at a time. Do not replace the existing application or create simulated production data.

**Important:** The six similarly named Markdown files already present in the working directory describe a separate Saino social app. This package contains new, DukaPro-specific files and does not overwrite those Saino documents.
