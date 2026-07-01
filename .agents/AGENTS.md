<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Website Reverse-Engineer Template

## What This Is
A reusable template for reverse-engineering any website into a clean, modern Next.js codebase using AI coding agents. The Next.js + shadcn/ui + Tailwind v4 base is pre-scaffolded — just run `/clone-website <url1> [<url2> ...]`.

## Tech Stack
- **Framework:** Next.js 16 (App Router, React 19, TypeScript strict)
- **UI:** shadcn/ui (Radix primitives, Tailwind CSS v4, `cn()` utility)
- **Icons:** Lucide React (default — will be replaced/supplemented by extracted SVGs)
- **Styling:** Tailwind CSS v4 with oklch design tokens
- **Deployment:** Vercel

## Commands
- `npm run dev` — Start dev server
- `npm run build` — Production build
- `npm run lint` — ESLint check
- `npm run typecheck` — TypeScript check
- `npm run check` — Run lint + typecheck + build

## Code Style
- TypeScript strict mode, no `any`
- Named exports, PascalCase components, camelCase utils
- Tailwind utility classes, no inline styles
- 2-space indentation
- Responsive: mobile-first

## Design Principles
- **Pixel-perfect emulation** — match the target's spacing, colors, typography exactly
- **No personal aesthetic changes during emulation phase** — match 1:1 first, custom

# Language Rules
- **Vietnamese Response**: Always communicate and respond to the user in Vietnamese.

# MCP Integration Rules
- **Maximize MCP Tool Usage**: Always leverage available MCP servers (like `codebase-memory-mcp` for codebase knowledge/navigation, `sequential-thinking` for structured reasoning, etc.) to improve understanding, analysis, and quality of generated code.

# Custom Skills Integration Rules
When performing coding, styling, planning, or deployment tasks, you **MUST** automatically load, refer to, and strictly follow the instructions in the following installed skills under `.agents/skills/`:
- **Design & Styling (Tailwind v4 / Aesthetics)**: Refer to `minimalist-ui`, `industrial-brutalist-ui`, `design-taste-frontend`, `high-end-visual-design`, `web-design-guidelines`, and `frontend-design` for pixel-perfect emulation and premium look.
- **Development Workflow (Superpowers)**: Refer to `brainstorming`, `writing-plans`, `executing-plans`, `test-driven-development`, and `systematic-debugging` to write specifications, plans, and tests before writing actual code.
- **Next.js & Vercel Best Practices**: Refer to `vercel-react-best-practices`, `vercel-composition-patterns`, `vercel-optimize`, `react-best-practices`, `nextjs-best-practices`, `nextjs-app-router-patterns`, `frontend-developer`, `tailwind-patterns`, and `frontend-api-integration-patterns` to write clean React/Next.js code and optimize build performance and API integration.

