#!/usr/bin/env python3
"""
Hiko Adventure Theme Transformer
Converts "Warm Autumn Hearth" to "OBSIDIAN VOID"
"""

import re

def main():
    # Read the file
    with open('style.css', 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content
    change_count = 0

    # Define the new header block
    new_header = '''/* ============================================
   HIKO ADVENTURE — OBSIDIAN VOID REDESIGN
   Palette: Deep midnight + Electric violet + Neon cyan
   Vibe: Premium dark crystal fantasy RPG
============================================ */

@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Rajdhani:wght@400;500;600;700&family=Nunito:wght@400;600;700;800&display=swap');

:root {
    --bg-deep:        #020108;
    --bg-base:        #060214;
    --bg-surface:     #0a0820;
    --bg-raised:      #120a32;
    --bg-card:        rgba(123, 95, 255, 0.05);
    --bg-card-hover:  rgba(123, 95, 255, 0.10);

    --accent-primary: #7b5fff;
    --accent-bright:  #a080ff;
    --accent-glow:    rgba(123, 95, 255, 0.55);
    --accent-cyan:    #00d4ff;
    --accent-cyan-glow: rgba(0, 212, 255, 0.45);
    --accent-gold:    #ffd060;
    --accent-gold-glow: rgba(255, 208, 96, 0.4);
    --accent-green:   #30e878;
    --accent-red:     #ff3355;

    --text-primary:   #e8e4ff;
    --text-secondary: #6050a0;
    --text-muted:     #251848;
    --text-gold:      #ffd060;

    --border-subtle:  rgba(123, 95, 255, 0.10);
    --border-glow:    rgba(123, 95, 255, 0.50);

    --radius-sm:  8px;
    --radius-md:  14px;
    --radius-lg:  20px;
    --radius-xl:  28px;
    --radius-pill: 999px;

    --shadow-card: 0 4px 24px rgba(0,0,0,0.6);
    --shadow-glow: 0 0 20px var(--accent-glow);
    --shadow-gold: 0 0 18px var(--accent-gold-glow);
}'''

    # Replace the header block (from start to end of :root)
    header_pattern = r'/\* =+.*?\*/\s*@import url\([^)]+\);\s*:root \{[^}]+\}'
    if re.search(header_pattern, content, re.DOTALL):
        content = re.sub(header_pattern, new_header, content, flags=re.DOTALL)
        change_count += 1
        print("✓ Replaced header block")
    else:
        print("⚠ Could not find header pattern, trying alternative...")
        # Try simpler approach - find :root block
        root_pattern = r':root \{[^}]+\}'
        if re.search(root_pattern, content):
            content = re.sub(root_pattern, new_header.split('}')[-2] + '}', content)
            change_count += 1

    # Define all replacements as (old, new) tuples
    replacements = [
        # Background colors
        ('#0c0602', '#020108'),
        ('#130804', '#060214'),
        ('#1c1008', '#0a0820'),
        ('#261508', '#120a32'),
        ('rgba(19, 8, 4,', 'rgba(6, 2, 20,'),
        ('rgba(19,8,4,', 'rgba(6,2,20,'),
        ('rgba(7, 6, 20,', 'rgba(6, 2, 20,'),
        ('rgba(7, 6, 15,', 'rgba(6, 2, 20,'),
        ('rgba(13, 11, 26,', 'rgba(10, 8, 32,'),
        ('rgba(50,42,70,', 'rgba(20, 15, 60,'),
        ('rgba(50, 42, 70,', 'rgba(20, 15, 60,'),
        ('rgba(28,18,48,', 'rgba(12, 8, 36,'),
        ('rgba(18,13,35,', 'rgba(8, 5, 28,'),
        ('rgba(90,40,180,', 'rgba(80, 40, 180,'),
        ('rgba(60,20,130,', 'rgba(50, 20, 130,'),
        ('rgba(15,10,32,', 'rgba(10, 6, 25,'),
        ('rgba(12,8,26,', 'rgba(8, 5, 20,'),
        ('rgba(8,45,30,', 'rgba(6, 30, 50,'),
        ('rgba(6,30,22,', 'rgba(5, 20, 45,'),
        ('#120d22', '#060214'),
        ('#1c0e10', '#0a0525'),
        ('#0d0d1a', '#050215'),
        ('#110d1e', '#070218'),
        ('#0a0c1a', '#040510'),
        ('#0d0520', '#060215'),

        # Accent primary (amber → violet)
        ('rgba(212, 112, 48,', 'rgba(123, 95, 255,'),
        ('rgba(212,112,48,', 'rgba(123,95,255,'),
        ('rgba(240, 144, 80,', 'rgba(160, 128, 255,'),
        ('rgba(240,144,80,', 'rgba(160,128,255,'),
        ('rgba(230, 57, 70,', 'rgba(255, 51, 85,'),
        ('rgba(230,57,70,', 'rgba(255,51,85,'),
        ('#d47030', '#7b5fff'),
        ('#f09050', '#a080ff'),
        ('#d45050', '#ff3355'),
        ('#b33e3e', '#cc2244'),
        ('rgba(74,108,143,', 'rgba(60, 50, 130,'),
        ('rgba(50,70,100,', 'rgba(40, 30, 100,'),
        ('rgba(100,140,180,', 'rgba(100, 80, 200,'),
        ('rgba(90,125,165,', 'rgba(80, 65, 170,'),
        ('rgba(65,90,125,', 'rgba(55, 40, 130,'),

        # Gold colors (keep similar but brighter)
        ('rgba(244, 196, 48,', 'rgba(255, 208, 96,'),
        ('rgba(244,196,48,', 'rgba(255,208,96,'),
        ('rgba(240, 190, 56,', 'rgba(255, 208, 96,'),
        ('rgba(240,190,56,', 'rgba(255,208,96,'),
        ('#f4c430', '#ffd060'),
        ('#f0be38', '#ffd060'),
        ('#e8a020', '#e8a000'),

        # Green/cyan (sage green → electric cyan)
        ('rgba(128, 200, 120,', 'rgba(0, 212, 255,'),
        ('rgba(128, 200, 112,', 'rgba(0, 212, 255,'),
        ('rgba(128,200,120,', 'rgba(0,212,255,'),
        ('rgba(128,200,112,', 'rgba(0,212,255,'),
        ('#78c870', '#00d4ff'),
        ('#80c878', '#00d4ff'),
        ('#7de8ff', '#00d4ff'),
        ('rgba(100, 200, 255,', 'rgba(0, 212, 255,'),
        ('rgba(100,200,255,', 'rgba(0,212,255,'),
        ('rgba(100, 220, 255,', 'rgba(0, 212, 255,'),
        ('rgba(100,220,255,', 'rgba(0,212,255,'),
        ('rgba(16, 168, 133,', 'rgba(0, 180, 200,'),
        ('rgba(16,168,133,', 'rgba(0,180,200,'),
        ('rgba(16, 168, 85,', 'rgba(0, 180, 200,'),
        ('#16a885', '#00b8c8'),
        ('#90c870', '#30e878'),

        # Text colors (warm beige → cool lavender)
        ('#fdf0dc', '#e8e4ff'),
        ('#b89880', '#6050a0'),
        ('#7a5840', '#251848'),
        ('#1a0a00', '#080518'),
        ('#1a0d00', '#080518'),

        # Card borders (warm gold tint → violet tint)
        ('rgba(255, 200, 120,', 'rgba(123, 95, 255,'),
        ('rgba(255,200,120,', 'rgba(123,95,255,'),

        # Ember particle colors
        ('rgba(230, 57, 70, 0.7)', 'rgba(0, 212, 255, 0.7)'),
        ('rgba(240, 144, 80, 0.6)', 'rgba(123, 95, 255, 0.6)'),

        # Battle gradient backgrounds
        ('background: linear-gradient(160deg, #120d22 0%, #1c0e10 60%, #0d0d1a 100%)',
         'background: linear-gradient(160deg, #060214 0%, #0a0525 60%, #050215 100%)'),
        ('background: linear-gradient(160deg, #130804 0%, #110d1e 50%, #0a0c1a 100%)',
         'background: linear-gradient(160deg, #060214 0%, #080220 50%, #040510 100%)'),

        # Body background (cosmic nebula)
        ('rgba(212, 112, 48, 0.12)', 'rgba(123, 95, 255, 0.10)'),
        ('rgba(120, 190, 80, 0.06)', 'rgba(0, 212, 255, 0.05)'),
        ('rgba(240, 190, 56, 0.05)', 'rgba(255, 208, 96, 0.03)'),

        # App box-shadow
        ('0 0 0 1px rgba(212, 112, 48, 0.15),', '0 0 0 1px rgba(123, 95, 255, 0.15),'),
        ('0 0 60px rgba(212, 112, 48, 0.1),', '0 0 60px rgba(123, 95, 255, 0.08),'),

        # Boss name glow
        ('0 0 12px rgba(240, 144, 80, 0.7),', '0 0 12px rgba(123, 95, 255, 0.8),'),
        ('0 0 24px rgba(212, 112, 48, 0.4)', '0 0 24px rgba(0, 212, 255, 0.4)'),

        # Boss image filter
        ('drop-shadow(0 0 18px rgba(71, 71, 71, 0.55))', 'drop-shadow(0 0 18px rgba(123, 95, 255, 0.50))'),

        # Battle zone glow
        ('rgba(212, 112, 48, 0.38)', 'rgba(123, 95, 255, 0.32)'),
        ('rgba(212, 112, 48, 0.14)', 'rgba(123, 95, 255, 0.12)'),

        # HP bar
        ('background: linear-gradient(90deg, #b33e3e, #d45050)', 'background: linear-gradient(90deg, #990033, #cc0044)'),
        ('background: linear-gradient(90deg, #b30000, #d45050, #ff6b35)', 'background: linear-gradient(90deg, #880022, #cc0044, #ff3355)'),

        # Damage numbers
        ('color: #ff7043', 'color: #ff5522'),
        ('0 0 10px rgba(255, 80, 0, 0.8)', '0 0 10px rgba(255, 85, 34, 0.8)'),
        ('0 0 22px rgba(255, 100, 0, 0.5)', '0 0 22px rgba(255, 100, 34, 0.5)'),

        # Battle ring color
        ('border: 1.5px solid rgba(240, 144, 80, 0.35)', 'border: 1.5px solid rgba(123, 95, 255, 0.35)'),

        # Battle result flare
        ('rgba(240, 144, 80, 0.6) 20%,', 'rgba(123, 95, 255, 0.6) 20%,'),
        ('rgba(244,196,48,0.9) 50%,', 'rgba(0, 212, 255, 0.9) 50%,'),
        ('rgba(230,57,70,0.6) 80%,', 'rgba(160, 128, 255, 0.6) 80%,'),

        # Bonus modal top bar gradient
        ('rgba(212, 112, 48, 0.6) 10%,', 'rgba(123, 95, 255, 0.6) 10%,'),
        ('rgba(240, 144, 80, 0.9) 30%,', 'rgba(160, 128, 255, 0.9) 30%,'),
        ('rgba(244,196,48,1) 50%,', 'rgba(255, 208, 96, 1) 50%,'),
        ('rgba(240, 144, 80, 0.9) 70%,', 'rgba(160, 128, 255, 0.9) 70%,'),
        ('rgba(212, 112, 48, 0.6) 90%,', 'rgba(123, 95, 255, 0.6) 90%,'),

        # Bonus modal title shimmer gradient
        ('background: linear-gradient(90deg, #f4c430, #e8a020, #f4c430)', 'background: linear-gradient(90deg, #ffd060, #a080ff, #ffd060)'),

        # Claim bonus button gradient
        ('#d47030 0%,', '#7b5fff 0%,'),
        ('#f09050 20%,', '#a080ff 20%,'),
        ('#f4c430 50%,', '#ffd060 50%,'),
        ('#f09050 80%,', '#a080ff 80%,'),
        ('#d47030 100%', '#7b5fff 100%'),

        # Rating table header
        ('background: rgba(212, 112, 48, 0.15)', 'background: rgba(123, 95, 255, 0.15)'),
        ('border-bottom: 1px solid rgba(212, 112, 48, 0.3)', 'border-bottom: 1px solid rgba(123, 95, 255, 0.3)'),

        # Battle result table
        ('background: rgba(240, 144, 80, 0.15) !important', 'background: rgba(123, 95, 255, 0.15) !important'),
        ('border-bottom: 1px solid rgba(240, 144, 80, 0.3) !important', 'border-bottom: 1px solid rgba(123, 95, 255, 0.3) !important'),
        ('background: rgba(240, 144, 80, 0.07)', 'background: rgba(123, 95, 255, 0.07)'),

        # FAB button
        ('background: rgba(19, 8, 4, 0.92)', 'background: rgba(6, 2, 20, 0.92)'),
        ('border: 1px solid rgba(212, 112, 48, 0.4)', 'border: 1px solid rgba(123, 95, 255, 0.4)'),

        # Friends modal hover
        ('border-color: rgba(212, 112, 48, 0.4)', 'border-color: rgba(123, 95, 255, 0.4)'),
        ('border-color: rgba(212, 112, 48, 0.3)', 'border-color: rgba(123, 95, 255, 0.3)'),

        # Member list hover
        ('border-color: rgba(212, 112, 48, 0.3)', 'border-color: rgba(123, 95, 255, 0.3)'),

        # Surrender button
        ('background: rgba(230, 57, 70, 0.12)', 'background: rgba(255, 51, 85, 0.12)'),
        ('border: 1px solid rgba(230, 57, 70, 0.35)', 'border: 1px solid rgba(255, 51, 85, 0.35)'),
        ('color: rgba(230, 57, 70, 0.85)', 'color: rgba(255, 51, 85, 0.85)'),
        ('background: rgba(230, 57, 70, 0.28)', 'background: rgba(255, 51, 85, 0.28)'),

        # Talents container
        ('rgba(7, 6, 20, 0.92)', 'rgba(6, 2, 20, 0.92)'),
        ('rgba(7, 6, 20, 0.55)', 'rgba(6, 2, 20, 0.55)'),
        ('border-color: rgba(240, 144, 80, 0.4)', 'border-color: rgba(123, 95, 255, 0.4)'),
        ('background: linear-gradient(135deg, rgba(212, 112, 48, 0.55), rgba(240, 144, 80, 0.40))', 'background: linear-gradient(135deg, rgba(123, 95, 255, 0.55), rgba(160, 128, 255, 0.40))'),
        ('background: linear-gradient(135deg, rgba(212, 112, 48, 0.4), rgba(240, 144, 80, 0.3))', 'background: linear-gradient(135deg, rgba(123, 95, 255, 0.4), rgba(160, 128, 255, 0.3))'),

        # Talent btn border
        ('border: 1px solid rgba(212, 112, 48, 0.3)', 'border: 1px solid rgba(123, 95, 255, 0.3)'),

        # Bonus day available
        ('background: linear-gradient(145deg, rgba(90,40,180,0.45), rgba(60,20,130,0.4))', 'background: linear-gradient(145deg, rgba(80, 50, 200, 0.55), rgba(50, 30, 160, 0.50))'),

        # Bonus day claimed
        ('background: linear-gradient(145deg, rgba(8,45,30,0.65), rgba(6,30,22,0.75))', 'background: linear-gradient(145deg, rgba(6, 30, 50, 0.65), rgba(5, 20, 45, 0.75))'),
        ('border-color: rgba(128, 200, 112,0.25)', 'border-color: rgba(0, 212, 255, 0.25)'),
        ('color: rgba(128, 200, 112,0.7)', 'color: rgba(0, 212, 255, 0.7)'),
        ('color: rgba(128, 200, 112,0.5)', 'color: rgba(0, 212, 255, 0.5)'),

        # Bonus calendar container
        ('border: 1px solid rgba(240, 144, 80, 0.14)', 'border: 1px solid rgba(123, 95, 255, 0.14)'),

        # Bonus day default border
        ('border: 1px solid rgba(240, 144, 80, 0.18)', 'border: 1px solid rgba(123, 95, 255, 0.18)'),
        ('background: linear-gradient(90deg, transparent, rgba(255, 200, 120, 0.1), transparent)', 'background: linear-gradient(90deg, transparent, rgba(123, 95, 255, 0.1), transparent)'),

        # Bonus info panel
        ('background: linear-gradient(135deg, rgba(15,10,32,0.7), rgba(12,8,26,0.85))', 'background: linear-gradient(135deg, rgba(10, 6, 28, 0.7), rgba(8, 4, 22, 0.85))'),
        ('border: 1px solid rgba(240, 144, 80, 0.15)', 'border: 1px solid rgba(123, 95, 255, 0.15)'),

        # Bonus streak badge
        ('background: linear-gradient(135deg, rgba(244,196,48,0.15), rgba(230,130,0,0.1))', 'background: linear-gradient(135deg, rgba(255, 208, 96, 0.15), rgba(123, 95, 255, 0.10))'),
        ('background: linear-gradient(135deg, rgba(240, 144, 80, 0.12), rgba(212, 112, 48, 0.08))', 'background: linear-gradient(135deg, rgba(160, 128, 255, 0.12), rgba(123, 95, 255, 0.08))'),
        ('box-shadow: 0 0 12px rgba(240, 144, 80, 0.15)', 'box-shadow: 0 0 12px rgba(123, 95, 255, 0.20)'),

        # HP bar container
        ('background: rgba(255, 200, 120, 0.08)', 'background: rgba(123, 95, 255, 0.08)'),

        # HP bar shimmer
        ('background: linear-gradient(90deg, transparent, rgba(255, 220, 160, 0.28), transparent)', 'background: linear-gradient(90deg, transparent, rgba(200, 180, 255, 0.28), transparent)'),

        # Trophypulse keyframe shadows
        ('filter: drop-shadow(0 0 8px rgba(244,196,48,0.6))', 'filter: drop-shadow(0 0 8px rgba(255,208,96,0.6))'),
        ('filter: drop-shadow(0 0 18px rgba(244,196,48,1))', 'filter: drop-shadow(0 0 18px rgba(255,208,96,1))'),

        # CardPulse keyframe
        ('box-shadow: 0 0 16px rgba(240, 144, 80, 0.4), inset 0 1px 0 rgba(255, 200, 120, 0.09)', 'box-shadow: 0 0 16px rgba(123, 95, 255, 0.4), inset 0 1px 0 rgba(123, 95, 255, 0.09)'),
        ('box-shadow: 0 0 28px rgba(240, 144, 80, 0.7), 0 4px 20px rgba(240, 144, 80, 0.3), inset 0 1px 0 rgba(255, 210, 140, 0.12)', 'box-shadow: 0 0 28px rgba(123, 95, 255, 0.7), 0 4px 20px rgba(123, 95, 255, 0.3), inset 0 1px 0 rgba(160, 128, 255, 0.12)'),

        # JackpotPulse keyframe
        ('box-shadow: 0 0 20px rgba(244,196,48,0.5), inset 0 1px 0 rgba(255, 200, 120, 0.1)', 'box-shadow: 0 0 20px rgba(255, 208, 96, 0.5), inset 0 1px 0 rgba(255, 208, 96, 0.1)'),
        ('box-shadow: 0 0 40px rgba(244,196,48,0.8), 0 4px 24px rgba(244,196,48,0.4), inset 0 1px 0 rgba(255, 210, 140, 0.15)', 'box-shadow: 0 0 40px rgba(255, 208, 96, 0.8), 0 4px 24px rgba(255, 208, 96, 0.4), inset 0 1px 0 rgba(255, 210, 140, 0.15)'),

        # Loader
        ('border: 3px solid rgba(255, 200, 120, 0.08)', 'border: 3px solid rgba(123, 95, 255, 0.08)'),

        # Battle header background
        ('rgba(7, 6, 20, 0.80)', 'rgba(6, 2, 20, 0.80)'),

        # Battle result scrollbar thumb
        ('background: rgba(240, 144, 80, 0.4)', 'background: rgba(123, 95, 255, 0.4)'),
    ]

    # Apply replacements
    for old, new in replacements:
        count = content.count(old)
        if count > 0:
            content = content.replace(old, new)
            change_count += count
            print(f"✓ Replaced '{old[:40]}...' ({count} occurrences)")

    # Font family changes for display titles
    font_replacements = [
        (".boss-name { font-family: 'Rajdhani'", ".boss-name { font-family: 'Cinzel'"),
        (".bonus-modal-title { font-family: 'Rajdhani'", ".bonus-modal-title { font-family: 'Cinzel'"),
        (".battle-result-title { font-family: 'Rajdhani'", ".battle-result-title { font-family: 'Cinzel'"),
    ]

    for old, new in font_replacements:
        if old in content:
            content = content.replace(old, new)
            change_count += 1
            print(f"✓ Font change: {old.split('{')[0]}")

    # Write the file back
    with open('style.css', 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"\n{'='*50}")
    print(f"Total changes made: {change_count}")
    print(f"File saved: style.css")
    print(f"{'='*50}")

if __name__ == '__main__':
    main()
