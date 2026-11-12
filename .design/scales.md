# Scales & Systems

---

## Responsive

### Breakpoints
mobile < 768px · tablet 768–1199px · desktop ≥ 1200px.

### Strategy
Mobile-first Tailwind: `md:` (768px) and custom `desk:` (1200px).

### What Changes at Each Breakpoint
- < 768: app top navigation; 16px page padding; summary cards become full-width selectable rows; search on its own line; quote cards replace the table; details open as a full-screen sheet with a sticky bottom action bar.
- 768–1199: 64px icon rail with accessible labels; 32px workspace padding; table; details open as a modal drawer with a backdrop.
- ≥ 1200: 208px sidebar; table and a 420px detail panel side by side, list stays usable.

---

## Grid

### Columns
Summary cards: 3 equal columns from 768px; 1 column below.

### Gutters
16px between summary cards and stacked blocks.

### Margins
32px workspace padding from 768px; 16px below.

### Max Width
None; the table scrolls horizontally inside its own container when narrow.

### Usage
Loose.

---

## Density

### Default Mode
Comfortable (about 80px rows).

### Modes Available
Single mode.

### What Density Affects
Not applicable.

---

## Color Modes

### Supported Modes
Light only.

### Mapping Strategy
Not applicable (single mode). Tokens live in `@theme` in `src/app/globals.css`.
