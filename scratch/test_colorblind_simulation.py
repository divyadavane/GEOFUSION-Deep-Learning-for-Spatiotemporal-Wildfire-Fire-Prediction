import numpy as np

# Brettel/Machado standard RGB CVD simulation transformation matrices
PROTANOPIA_MATRIX = np.array([
    [0.56667, 0.43333, 0.00000],
    [0.55833, 0.44167, 0.00000],
    [0.00000, 0.24167, 0.75833]
])

DEUTERANOPIA_MATRIX = np.array([
    [0.62500, 0.37500, 0.00000],
    [0.70000, 0.30000, 0.00000],
    [0.00000, 0.30000, 0.70000]
])

TRITANOPIA_MATRIX = np.array([
    [0.95000, 0.05000, 0.00000],
    [0.00000, 0.43333, 0.56667],
    [0.00000, 0.47500, 0.52500]
])

def simulate_cvd(rgb, matrix):
    rgb_norm = np.array(rgb[:3]) / 255.0
    sim = np.dot(matrix, rgb_norm)
    sim = np.clip(sim, 0.0, 1.0) * 255.0
    return [int(round(x)) for x in sim]

def get_risk_color(score):
    s = max(0.0, min(1.0, score))
    if s < 0.20:
        t = s / 0.20
        return [int(16 + t * 84), int(185 + t * 10), int(129 - t * 80), 140]
    elif s < 0.40:
        t = (s - 0.20) / 0.20
        return [int(100 + t * 134), int(195 - t * 16), int(49 - t * 41), 160]
    elif s < 0.60:
        t = (s - 0.40) / 0.20
        return [int(234 + t * 15), int(179 - t * 64), int(8 + t * 14), 180]
    elif s < 0.80:
        t = (s - 0.60) / 0.20
        return [int(249 - t * 24), int(115 - t * 86), int(22 + t * 50), 200]
    else:
        t = (s - 0.80) / 0.20
        return [int(225 - t * 57), int(29 + t * 56), int(72 + t * 175), 220]

test_scores = [0.05, 0.25, 0.50, 0.70, 0.90]
tiers = ["P0-P20 (Baseline)", "P20-P40 (Low)", "P40-P60 (Moderate)", "P60-P80 (Elevated)", "P80-P100 (Severe/Peak)"]

print("=== COLORBLIND SIMULATION TEST REPORT ===")
for score, tier in zip(test_scores, tiers):
    base_rgb = get_risk_color(score)[:3]
    protan = simulate_cvd(base_rgb, PROTANOPIA_MATRIX)
    deutan = simulate_cvd(base_rgb, DEUTERANOPIA_MATRIX)
    tritan = simulate_cvd(base_rgb, TRITANOPIA_MATRIX)
    
    # Calculate perceived luminance: 0.299*R + 0.587*G + 0.114*B
    lum_base = 0.299*base_rgb[0] + 0.587*base_rgb[1] + 0.114*base_rgb[2]
    lum_protan = 0.299*protan[0] + 0.587*protan[1] + 0.114*protan[2]
    lum_deutan = 0.299*deutan[0] + 0.587*deutan[1] + 0.114*deutan[2]
    
    print(f"\n[{tier}] Score={score:.2f}:")
    print(f"  - Original RGB:    {base_rgb} (Luminance: {lum_base:.1f})")
    print(f"  - Protanopia Sim:  {protan} (Luminance: {lum_protan:.1f})")
    print(f"  - Deuteranopia Sim:{deutan} (Luminance: {lum_deutan:.1f})")
    print(f"  - Tritanopia Sim:  {tritan}")
