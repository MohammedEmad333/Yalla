---
name: Yalla Velocity
colors:
  surface: '#f9f9fc'
  surface-dim: '#dadadc'
  surface-bright: '#f9f9fc'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f6'
  surface-container: '#eeeef0'
  surface-container-high: '#e8e8ea'
  surface-container-highest: '#e2e2e5'
  on-surface: '#1a1c1e'
  on-surface-variant: '#5a4136'
  inverse-surface: '#2f3133'
  inverse-on-surface: '#f0f0f3'
  outline: '#8e7164'
  outline-variant: '#e2bfb0'
  surface-tint: '#a04100'
  primary: '#a04100'
  on-primary: '#ffffff'
  primary-container: '#ff6b00'
  on-primary-container: '#572000'
  inverse-primary: '#ffb693'
  secondary: '#00629d'
  on-secondary: '#ffffff'
  secondary-container: '#00a2fd'
  on-secondary-container: '#003558'
  tertiary: '#5d5f5f'
  on-tertiary: '#ffffff'
  tertiary-container: '#989999'
  on-tertiary-container: '#2f3132'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdbcc'
  primary-fixed-dim: '#ffb693'
  on-primary-fixed: '#351000'
  on-primary-fixed-variant: '#7a3000'
  secondary-fixed: '#cfe5ff'
  secondary-fixed-dim: '#98cbff'
  on-secondary-fixed: '#001d33'
  on-secondary-fixed-variant: '#004a77'
  tertiary-fixed: '#e2e2e2'
  tertiary-fixed-dim: '#c6c6c7'
  on-tertiary-fixed: '#1a1c1c'
  on-tertiary-fixed-variant: '#454747'
  background: '#f9f9fc'
  on-background: '#1a1c1e'
  surface-variant: '#e2e2e5'
typography:
  display-lg:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
  title-md:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 26px
  body-md:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-sm:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 32px
---

## Brand & Style

The brand personality is energetic, rapid, and dependable, reflecting the pulse of a modern Arab metropolis. The design system utilizes a **Modern Corporate** style with **Glassmorphic** accents to convey a sense of high-tech efficiency and forward momentum. 

The aesthetic prioritizes clarity and speed of thought. By combining vibrant, high-energy colors with clean, spacious layouts, the UI evokes an emotional response of urgency balanced by total control. It is designed for users who are on the move, requiring high-contrast touch targets and instantly recognizable status indicators.

## Colors

The palette is built on high-octane contrast to ensure legibility under bright sunlight and during rapid movement.

- **Primary (Bright Orange):** Used for primary actions, progress indicators, and active delivery states. It signifies speed and energy.
- **Secondary (Sky Blue):** Used for trust-based elements like verified driver badges, map paths, and support features.
- **Neutral:** A deep carbon black for typography and a series of cool grays for background layering to prevent visual fatigue.
- **Surface:** Pure White is the foundation for all cards and containers to maintain a sense of cleanliness and clinical precision.

## Typography

This design system utilizes **IBM Plex Sans Arabic** for its technical precision and exceptional legibility in both Arabic and Latin scripts. 

The type scale is generous to accommodate quick scanning while driving or walking. Headlines use a tighter letter-spacing and heavier weights to emphasize urgency. For mobile displays, display sizes are capped to ensure address strings and order details do not wrap awkwardly. All tracking and kerning are optimized for right-to-left (RTL) reading flows as the primary orientation.

## Layout & Spacing

The layout follows a **Fluid Grid** model optimized for one-handed mobile use. 

- **Mobile:** A 4-column grid with 16px side margins. Interactive elements (buttons, inputs) must maintain a minimum height of 48px for easy tapping.
- **Desktop/Tablet:** A 12-column grid. On larger screens, content is centered within a 1200px max-width container.
- **Rhythm:** Spacing follows a 4px base unit. Vertical rhythm is strictly enforced using `md` (16px) and `lg` (24px) increments to create clear groupings of information like "Order Summary" and "Driver Details."

## Elevation & Depth

Visual hierarchy is established through **Ambient Shadows** and **Tonal Layers**.

- **Level 1 (Base):** Pure White or light gray backgrounds.
- **Level 2 (Cards):** Soft, diffused shadows (0px 4px 20px rgba(0,0,0, 0.05)) to lift order cards and menu items from the background.
- **Level 3 (Floating):** Used for primary action buttons (FABs) and active delivery tracking sheets. These use a more pronounced shadow with a hint of the primary color (Orange) in the blur to suggest activity.
- **Overlays:** Glassmorphic blurs (12px backdrop filter) are used for top navigation bars to maintain context of the map underneath while providing clear legibility for status icons.

## Shapes

The shape language is **Rounded**, reflecting the friendly and accessible nature of the service. 

Standard components like input fields and cards use a 0.5rem (8px) radius. Larger containers, such as bottom sheets and promotional banners, use `rounded-xl` (1.5rem/24px) to create a soft, modern feel. Buttons are occasionally rendered as full pills (rounded-full) when they represent "Start" or "Go" actions, mimicking the aerodynamic curves of a motorcycle.

## Components

- **Buttons:** Primary buttons use the Bright Orange background with White text. They feature a subtle inner-glow on the top edge to create a tactile, "pressable" feel.
- **Chips:** Used for "Quick-Select" addresses (Home, Office). These have a Sky Blue border and a very light blue tinted background.
- **Inputs:** Text fields use a 1px soft gray border that transitions to Bright Orange on focus. Labels are always visible to ensure the user never loses context during fast data entry.
- **Cards:** Order cards feature a vertical "status line" on the leading edge (right side for Arabic) that changes color based on delivery stage (Grey = Pending, Orange = In-Transit, Green = Delivered).
- **Icons:** Minimalist line icons with a 2px stroke weight. Key icons like the motorcycle and location pin use a two-tone style, incorporating both the Primary and Secondary colors.
- **Live Tracker:** A persistent bottom-sheet component that uses a Glassmorphic background to show real-time driver movement without obscuring the map layout.