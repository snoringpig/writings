// GLSL "chunks": each tutorial step is a list of chunks concatenated into one fragment shader.
// A chunk with a version suffix (terrain_v2 ...) replaces the earlier version in later steps.
const CHUNKS = {};

CHUNKS.header = `#version 300 es
precision highp float;
precision highp int;

uniform vec2  uRes;       // output size, pixels
uniform int   uSpp;       // samples per pixel along each axis (uSpp² in total)
uniform vec3  uSun;       // unit vector pointing toward the sun
uniform float uSnowline;  // km above the base plane
uniform float uTreeline;  // km above the base plane
uniform float uCloud;     // cloud coverage, 0..1
out vec4 fragColor;

float gSeed;              // a fresh random number in [0,1) for every sample (set in main)

// "Hash without Sine" (Dave Hoskins): cheap, GPU-stable pseudo-random numbers in [0,1).
float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}
`;

CHUNKS.camera = `// ---- Camera: a pinhole at CAM_POS looking at CAM_TARGET. Units are km, y is up.
const vec3  CAM_POS    = vec3(0.0, 0.70, 0.0);
const vec3  CAM_TARGET = vec3(0.0, 0.66, -7.6);
const float CAM_VFOV   = 30.0;                      // vertical field of view, degrees

vec3 cameraRay(vec2 pix) {                          // pix: position on the image, in pixels
    vec3 f = normalize(CAM_TARGET - CAM_POS);       // forward
    vec3 r = normalize(cross(f, vec3(0.0, 1.0, 0.0)));  // right
    vec3 u = cross(r, f);                           // up
    vec2 s = (2.0 * pix - uRes) / uRes.y;           // screen coords, s.y in [-1, 1]
    float k = tan(radians(0.5 * CAM_VFOV));
    return normalize(f + k * (s.x * r + s.y * u));
}
`;

CHUNKS.sky = `// ---- Sky: blend from zenith blue toward a paler horizon as the air mass grows.
const vec3 SUN_COLOR = vec3(1.00, 0.93, 0.82);

vec3 sky(vec3 rd) {
    vec3 zenith  = vec3(0.006, 0.085, 0.480);
    vec3 horizon = vec3(0.120, 0.300, 0.620);
    float airMass = 1.0 / max(rd.y, 0.03);          // path length relative to straight up
    vec3 col = mix(zenith, horizon, 1.0 - exp(-0.08 * (airMass - 1.0)));
    float mu = max(dot(rd, uSun), 0.0);             // cosine of the angle to the sun
    col += SUN_COLOR * (0.10 * pow(mu, 6.0) + 0.6 * pow(mu, 400.0));   // glow around the sun
    return col;
}
`;

CHUNKS.post_srgb = `// ---- Output: we compute in linear light; the display expects sRGB-encoded values.
vec3 linearToSRGB(vec3 c) {
    c = clamp(c, 0.0, 1.0);
    return mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
vec3 post(vec3 c) { return linearToSRGB(c); }
`;

CHUNKS.main = `// ---- Entry point: average a regular uSpp × uSpp grid of rays over each pixel (supersampling).
void main() {
    vec3 sum = vec3(0.0);
    for (int j = 0; j < uSpp; j++)
    for (int i = 0; i < uSpp; i++) {
        vec2 sub = (vec2(i, j) + 0.5) / float(uSpp);            // sub-pixel offset in (0,1)²
        gSeed = hash12(gl_FragCoord.xy * 1.7 + sub * 113.0);
        sum += render(CAM_POS, cameraRay(gl_FragCoord.xy - 0.5 + sub));
    }
    fragColor = vec4(post(sum / float(uSpp * uSpp)), 1.0);
}
`;

CHUNKS.render_1 = `vec3 render(vec3 ro, vec3 rd) {
    return sky(rd);
}
`;

// ---------------------------------------------------------------- step 2
CHUNKS.massif = `// ---- The volcano: a broad, concave cone, plus a few hand-placed landforms.
const vec2  VOLC_C = vec2(-0.52, -7.6);  // vent position (x, z), km
const vec2  VOLC_S = vec2(2.0, 1.0);     // footprint stretched 2× left-right
const float VOLC_H = 3.67;               // km
const float VOLC_L = 1.64;               // e-folding distance, km
const float VOLC_A = 0.8;                // summit rounding radius, km

float smin(float a, float b, float k) {  // smooth minimum (blends over a width k)
    float h = max(k - abs(a - b), 0.0) / k;
    return min(a, b) - 0.25 * k * h * h;
}

// Gaussian ridge along segment a→b; crest height goes from ha (at a) to hb (at b); half-width w.
float ridge(vec2 x, vec2 a, vec2 b, float ha, float hb, float w) {
    vec2  ab = b - a;
    float s  = clamp(dot(x - a, ab) / dot(ab, ab), 0.0, 1.0);
    float d  = length(x - a - s * ab);
    return mix(ha, hb, s) * exp(-d * d / (w * w));
}

float volcano(vec2 x) {
    float r = length((x - VOLC_C) / VOLC_S);
    float h = VOLC_H * exp(-sqrt(r * r + VOLC_A * VOLC_A) / VOLC_L);
    h += ridge(x, vec2(0.3, -7.4), vec2(2.8, -6.8), 0.22, 0.30, 0.60);     // right shoulder
    h += ridge(x, vec2(0.48, -5.8), vec2(-0.09, -4.1), 0.08, 0.03, 0.15);  // spur toward us
    // a cirque on the right flank: cap the height by a cone that is flat inside radius 0.5 km
    float cirque = 0.80 + 1.1 * max(length(x - vec2(1.45, -5.5)) - 0.5, 0.0);
    return smin(h, cirque, 0.15);
}
`;

CHUNKS.terrain_v1 = `float terrain(vec2 x) { return volcano(x); }
`;

CHUNKS.scene_v1 = `// ---- Scene = terrain for now. sceneStep returns (a step that cannot pass through the surface,
// the vertical gap to the surface): the march moves by the first and stops on the second.
const float LIP_K = 0.5;                 // 1/sqrt(1 + L²) for slopes up to L ≈ 1.7

float sceneHeight(vec2 x) { return terrain(x); }
vec2  sceneStep(vec3 p)   { float gap = p.y - terrain(p.xz); return vec2(LIP_K * gap, gap); }
`;

CHUNKS.march = `// ---- Ray marching: step forward by the safe distance until we are within a pixel of the ground.
const float T_MAX = 60.0;                // km
const float Y_MAX = 3.2;                 // nothing is taller than this

float raymarch(vec3 ro, vec3 rd) {
    float t = 0.0;
    for (int i = 0; i < 500; i++) {
        vec3 p = ro + t * rd;
        vec2 s = sceneStep(p);                              // (safe step, vertical gap)
        if (abs(s.y) < 0.0004 * t) return t;                // within ~half a pixel of the surface
        if (t > T_MAX || (p.y > Y_MAX && rd.y > 0.0)) return -1.0;
        t += s.x;                                           // s.x < 0 (overshoot) steps back
    }
    return t;                                               // out of steps: grazing a surface
}

// Normal of the surface y = h(x, z) is (-dh/dx, 1, -dh/dz), normalized; central differences
// with a spacing about one pixel footprint wide (detail finer than a pixel can't be shown anyway).
vec3 calcNormal(vec3 p, float t) {
    float e = 0.0005 * t + 0.0002;
    vec2 h = vec2(e, 0.0);
    return normalize(vec3(sceneHeight(p.xz - h.xy) - sceneHeight(p.xz + h.xy),
                          2.0 * e,
                          sceneHeight(p.xz - h.yx) - sceneHeight(p.xz + h.yx)));
}
`;

CHUNKS.render_2 = `// ---- Shading for now: grey clay lit by the sun alone (Lambert's cosine law). Nothing else
// lights the scene yet, so every face turned away from the sun is black, as on the Moon.
vec3 render(vec3 ro, vec3 rd) {
    float t = raymarch(ro, rd);
    if (t < 0.0) return sky(rd);
    vec3 p = ro + t * rd;
    vec3 n = calcNormal(p, t);
    float lambert = max(dot(n, uSun), 0.0);         // cosine of the sun's angle to the normal
    return vec3(0.25) * 1.55 * lambert;             // albedo 0.25 × sun strength 1.55
}
`;

// ---------------------------------------------------------------- step 3
CHUNKS.noise = `// ---- Value noise: random values on the integer lattice, smoothly interpolated. Range [0,1].
float noise(vec2 x) {
    vec2 i = floor(x), f = fract(x);
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);     // quintic fade 6t⁵-15t⁴+10t³
    float a = hash12(i),                  b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0)), d = hash12(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// fBm: octaves at frequency ×2, amplitude ×½, each rotated ~37° so lattice axes don't line up.
const mat2 OCTAVE = mat2(1.6, -1.2, 1.2, 1.6);              // = 2 · rotation(36.87°)
float fbm(vec2 x, int octaves) {                            // range ≈ [-1, 1]
    float sum = 0.0, amp = 0.5;
    for (int i = 0; i < octaves; i++) {
        sum += amp * (2.0 * noise(x) - 1.0);
        x = OCTAVE * x;
        amp *= 0.5;
    }
    return sum;
}

// Ridged noise: fold each octave at its midpoint, so zero-crossings become sharp crests.
// No rotation between octaves: callers use it in stretched coordinates and need the axes kept.
float ridged(vec2 x, int octaves) {                         // range ≈ [0, 1]
    float sum = 0.0, amp = 0.5;
    for (int i = 0; i < octaves; i++) {
        float n = 1.0 - abs(2.0 * noise(x) - 1.0);
        sum += amp * n * n;
        x = 2.0 * x + vec2(17.3, 5.1);
        amp *= 0.5;
    }
    return sum;
}
`;

CHUNKS.erosion = `// ---- Erosion detail on top of the large shapes.
// Water runs straight downhill, which on a cone means radially. So sample ridged noise in polar
// coordinates (θ, r), dense in θ and sparse in r: the ridges come out as long radial ribs.
float gullies(vec2 x) {
    vec2  q = (x - VOLC_C) / VOLC_S;
    float r = length(q);
    float theta = atan(q.x, q.y);                   // 0 toward the camera; the ±π seam is behind
    vec2  uv = vec2(theta * 3.5, r * 0.7);          // 3.5 cells per radian around, 0.7 per km down
    float fade = smoothstep(0.2, 1.0, r) * exp(-r / 2.0);   // none at the vent or the far apron
    return 0.34 * fade * ridged(uv, 6);
}
`;

CHUNKS.terrain_v2 = `float terrain(vec2 x) {
    return volcano(x) + gullies(x) + 0.035 * fbm(2.5 * x, 7);   // + isotropic lumps
}
`;

// ---------------------------------------------------------------- step 4
CHUNKS.lighting = `// ---- Lighting: direct sun (with soft shadows) + blue sky dome + light bounced off the ground.
const float SUN_POWER    = 1.55;
const vec3  SKY_LIGHT    = vec3(0.090, 0.150, 0.300);
const vec3  BOUNCE_LIGHT = vec3(0.050, 0.040, 0.035);

// March toward the sun; the smallest angular clearance d/t to any occluder sets the penumbra.
float softShadow(vec3 ro, vec3 rd) {
    float res = 1.0, t = 0.002;
    for (int i = 0; i < 100; i++) {
        vec3 p = ro + t * rd;
        if (p.y > Y_MAX) break;
        vec2 s = sceneStep(p);                      // (safe step, vertical gap)
        res = min(res, 10.0 * 0.5 * s.y / t);       // clearance ≈ the ground's safe step; 10 ⇔ penumbra ≈ 0.1 rad
        if (res < 0.0) break;                       // inside the ground or a crown: full shadow
        t += clamp(s.x, 0.002, 0.25);
    }
    return smoothstep(0.0, 1.0, res);
}

// sunVisible: extra attenuation of the sun from anything else (clouds, step 9); 1.0 for now.
vec3 shade(vec3 p, vec3 n, vec3 albedo, float t, float sunVisible) {
    float sun = max(dot(n, uSun), 0.0) * sunVisible;
    if (sun > 0.0) sun *= softShadow(p + (0.001 + 0.0006 * t) * n, uSun);
    vec3 light = SUN_POWER * SUN_COLOR * sun
               + SKY_LIGHT    * (0.5 + 0.5 * n.y)   // fraction of the sky dome this face sees
               + BOUNCE_LIGHT * (0.5 - 0.5 * n.y);  // fraction of the ground it sees
    return albedo * light;
}
`;

CHUNKS.render_4 = `vec3 render(vec3 ro, vec3 rd) {
    float t = raymarch(ro, rd);
    if (t < 0.0) return sky(rd);
    vec3 p = ro + t * rd;
    vec3 n = calcNormal(p, t);
    return shade(p, n, vec3(0.25), t, 1.0);         // the same grey clay, now sunlit
}
`;

// ---------------------------------------------------------------- step 5
CHUNKS.materials = `// ---- Materials: what the ground is made of, decided from altitude, slope, shape and noise.
// Albedos are linear-light reflectances (fraction of light reflected).
const vec3 SCREE   = vec3(0.34, 0.25, 0.20);        // pinkish talus
const vec3 BOULDER = vec3(0.24, 0.23, 0.22);        // older grey rock lower down
const vec3 RED     = vec3(0.30, 0.11, 0.08);        // oxidized (iron-rich) lava
const vec3 DARK    = vec3(0.08, 0.065, 0.06);       // dark lava exposed on cliffs and ribs
const vec3 MEADOW  = vec3(0.11, 0.12, 0.065);       // sparse grass
const vec3 SNOW    = vec3(0.85, 0.88, 0.92);

// Convexity: how far the ground pokes above the average of its neighbours 60 m away.
// > 0 on ribs and crests, < 0 in gullies (a discrete Laplacian, sign flipped).
float convexity(vec2 x) {
    const float e = 0.06;
    float avg = 0.25 * (terrain(x + vec2(e, 0.0)) + terrain(x - vec2(e, 0.0)) +
                        terrain(x + vec2(0.0, e)) + terrain(x - vec2(0.0, e)));
    return clamp(120.0 * (terrain(x) - avg), -1.0, 1.0);
}

vec3 groundAlbedo(vec3 p, vec3 n) {
    float steep = 1.0 - n.y;                        // 0 = flat, 0.29 = 45°, 0.5 = 60°
    float cx = convexity(p.xz);
    // 1. talus, mottled at two scales; greyer, older rock lower down
    vec3 col = mix(BOULDER, SCREE, smoothstep(0.45, 0.8, p.y));
    col *= 0.75 + 0.25 * noise(p.xz * 9.0) + 0.25 * noise(p.xz * 60.0);
    // 2. red streaks: oxidized debris washed downhill, so streak them radially like the gullies
    vec2  q = (p.xz - VOLC_C) / VOLC_S;
    float streak = fbm(vec2(atan(q.x, q.y) * 14.0, length(q) * 2.0), 4);
    float red = smoothstep(0.15, 0.45, streak) * smoothstep(0.55, 0.85, p.y);
    col = mix(col, RED, 0.75 * red);
    // 3. steep faces and sharp ribs can't hold loose rock: expose the dark lava underneath
    col = mix(col, DARK, max(smoothstep(0.30, 0.55, steep), 0.6 * smoothstep(0.2, 0.8, cx)));
    // 4. grass: low, gentle ground, in patches
    float low = 1.0 - smoothstep(0.45, 0.75, p.y + 0.15 * fbm(4.0 * p.xz, 3));
    float grass = low * (1.0 - smoothstep(0.06, 0.18, steep)) * smoothstep(0.1, 0.4, fbm(10.0 * p.xz, 4));
    col = mix(col, MEADOW, 0.7 * grass);
    // 5. snow: above a ragged snow line that dips down gullies and rises on ribs,
    //    and only on faces gentle enough to hold it (< ~40°)
    float line = uSnowline + 0.25 * fbm(3.0 * p.xz, 5) + 0.25 * cx;
    float snow = smoothstep(line - 0.04, line + 0.04, p.y) * smoothstep(0.42, 0.24, steep);
    return mix(col, SNOW, snow);
}
`;

CHUNKS.render_5 = `vec3 render(vec3 ro, vec3 rd) {
    float t = raymarch(ro, rd);
    if (t < 0.0) return sky(rd);
    vec3 p = ro + t * rd;
    vec3 n = calcNormal(p, t);
    return shade(p, n, groundAlbedo(p, n), t, 1.0);
}
`;

// ---------------------------------------------------------------- step 6
CHUNKS.butte = `// ---- The forested butte in the foreground: an elongated dome with a lumpy, bouldery skin.
const vec2  BUTTE_C = vec2(0.16, -1.9);
const float BUTTE_H = 0.46;
const mat2  BUTTE_R = mat2(0.97, -0.24, 0.24, 0.97);      // rotate the long axis by ~14°

float butteDome(vec2 x) {
    vec2 q = (BUTTE_R * (x - BUTTE_C)) / vec2(1.3, 1.15);  // semi-axes 1.3 km × 1.15 km
    return BUTTE_H * exp(-dot(q, q));
}
float butte(vec2 x) {
    return butteDome(x) * (1.0 + 0.12 * fbm(5.0 * x, 6));  // lumps scale with the dome
}
`;

CHUNKS.terrain_v3 = `float terrain(vec2 x) {
    return volcano(x) + gullies(x) + butte(x) + 0.035 * fbm(2.5 * x, 7);
}
`;

CHUNKS.materials_v2 = `// ---- Materials, plus soil on the butte (the only change from step 5: SOIL and section 5).
// Albedos are linear-light reflectances (fraction of light reflected).
const vec3 SCREE   = vec3(0.34, 0.25, 0.20);        // pinkish talus
const vec3 BOULDER = vec3(0.24, 0.23, 0.22);        // older grey rock lower down
const vec3 RED     = vec3(0.30, 0.11, 0.08);        // oxidized (iron-rich) lava
const vec3 DARK    = vec3(0.08, 0.065, 0.06);       // dark lava exposed on cliffs and ribs
const vec3 MEADOW  = vec3(0.11, 0.12, 0.065);       // sparse grass
const vec3 SNOW    = vec3(0.85, 0.88, 0.92);
const vec3 SOIL    = vec3(0.15, 0.12, 0.09);        // weathered soil on the older butte

// Convexity: how far the ground pokes above the average of its neighbours 60 m away.
// > 0 on ribs and crests, < 0 in gullies (a discrete Laplacian, sign flipped).
float convexity(vec2 x) {
    const float e = 0.06;
    float avg = 0.25 * (terrain(x + vec2(e, 0.0)) + terrain(x - vec2(e, 0.0)) +
                        terrain(x + vec2(0.0, e)) + terrain(x - vec2(0.0, e)));
    return clamp(120.0 * (terrain(x) - avg), -1.0, 1.0);
}

vec3 groundAlbedo(vec3 p, vec3 n) {
    float steep = 1.0 - n.y;                        // 0 = flat, 0.29 = 45°, 0.5 = 60°
    float cx = convexity(p.xz);
    // 1. talus, mottled at two scales; greyer, older rock lower down
    vec3 col = mix(BOULDER, SCREE, smoothstep(0.45, 0.8, p.y));
    col *= 0.75 + 0.25 * noise(p.xz * 9.0) + 0.25 * noise(p.xz * 60.0);
    // 2. red streaks: oxidized debris washed downhill, so streak them radially like the gullies
    vec2  q = (p.xz - VOLC_C) / VOLC_S;
    float streak = fbm(vec2(atan(q.x, q.y) * 14.0, length(q) * 2.0), 4);
    float red = smoothstep(0.15, 0.45, streak) * smoothstep(0.55, 0.85, p.y);
    col = mix(col, RED, 0.75 * red);
    // 3. steep faces and sharp ribs can't hold loose rock: expose the dark lava underneath
    col = mix(col, DARK, max(smoothstep(0.30, 0.55, steep), 0.6 * smoothstep(0.2, 0.8, cx)));
    // 4. grass: low, gentle ground, in patches
    float low = 1.0 - smoothstep(0.45, 0.75, p.y + 0.15 * fbm(4.0 * p.xz, 3));
    float grass = low * (1.0 - smoothstep(0.06, 0.18, steep)) * smoothstep(0.1, 0.4, fbm(10.0 * p.xz, 4));
    col = mix(col, MEADOW, 0.7 * grass);
    // 5. the butte is older than the talus around it: weathered soil instead of fresh rock
    float soil = smoothstep(0.04, 0.18, butteDome(p.xz));
    col = mix(col, SOIL * (0.7 + 0.6 * noise(p.xz * 40.0)), soil);
    // 6. snow: above a ragged snow line that dips down gullies and rises on ribs,
    //    and only on faces gentle enough to hold it (< ~40°)
    float line = uSnowline + 0.25 * fbm(3.0 * p.xz, 5) + 0.25 * cx;
    float snow = smoothstep(line - 0.04, line + 0.04, p.y) * smoothstep(0.42, 0.24, steep);
    return mix(col, SNOW, snow);
}
`;

// ---------------------------------------------------------------- step 7
CHUNKS.trees = `// ---- Trees: one cone per occupied cell of an 11 m grid, added on top of the ground height.
const float CELL   = 0.011;                 // grid spacing, km
const float TREE_H = 0.024;                 // tallest tree, km
const vec3  NEEDLES = vec3(0.022, 0.046, 0.020);

// Probability that a cell holds a tree, read at the cell's centre so each tree is all there or not at all.
float treeDensity(vec2 x) {
    float clumps = fbm(3.0 * x + 7.0, 4);                                 // groves and clearings
    float soil   = smoothstep(0.05, 0.25, butteDome(x));                  // the butte is older
    return smoothstep(0.05, 0.35, clumps + 0.38 * soil);
}

// Canopy over x: (height above the ground, a random number for the tree that is tallest there).
// A trunk may sit anywhere in its cell and a crown is at most half a cell wide, so only the
// 2×2 block of cells nearest x can reach it. Trees shrink to nothing toward the tree line.
vec2 trees(vec2 x, float ground) {
    float below = 1.0 - smoothstep(uTreeline - 0.5, uTreeline, ground);  // 0 above the tree line
    if (below <= 0.0) return vec2(0.0);
    vec2 base = floor(x / CELL - 0.5);
    vec2 top = vec2(0.0);
    for (int j = 0; j < 2; j++)
    for (int i = 0; i < 2; i++) {
        vec2 cell = base + vec2(i, j);
        if (hash12(cell + 37.0) > treeDensity((cell + 0.5) * CELL)) continue;   // empty cell
        vec2  c = (cell + hash22(cell)) * CELL;                       // trunk position
        float R = (0.30 + 0.20 * hash12(cell + 71.0)) * CELL;          // crown radius ≤ CELL / 2
        float H = TREE_H * (0.55 + 0.45 * hash12(cell + 113.0)) * below;
        float h = H * (1.0 - length(x - c) / R);                       // a cone
        if (h > top.x) top = vec2(h, hash12(cell + 151.0));
    }
    return top;
}

float sceneHeight(vec2 x) { float g = terrain(x); return g + trees(x, g).x; }

// Three lower bounds on the distance to ground-plus-trees; the largest one is the step.
vec2 sceneStep(vec3 p) {
    float g = terrain(p.xz);
    float shell = 0.5 * (p.y - g - TREE_H);       // under the tree-top envelope (slope ≲ 1.7)
    if (shell > 0.5 * TREE_H) return vec2(shell, p.y - g - TREE_H);   // far above every crown
    // trees grow only where the ground is below the tree line, so every crown is below
    // uTreeline + TREE_H: above that height, only the bare ground can be hit
    float bare = min(0.5 * (p.y - g), p.y - uTreeline - TREE_H);
    float gap  = p.y - g - trees(p.xz, g).x;      // vertical gap to the canopy (or bare ground)
    return vec2(max(max(shell, bare), 0.1 * gap), gap);    // cones are steep: slope ≲ 10
}
`;

CHUNKS.render_7 = `vec3 render(vec3 ro, vec3 rd) {
    float t = raymarch(ro, rd);
    if (t < 0.0) return sky(rd);
    vec3 p = ro + t * rd;
    vec3 n = calcNormal(p, t);
    vec2 tree = trees(p.xz, terrain(p.xz));
    bool isTree = tree.x > 0.0;                     // under a crown
    vec3 albedo = isTree ? NEEDLES * (0.7 + 0.6 * tree.y)   // each tree its own shade of green
                         : groundAlbedo(p, n);
    return shade(p, n, albedo, t, 1.0);
}
`;

// ---------------------------------------------------------------- step 8
CHUNKS.atmosphere = `// ---- Aerial perspective: light from the scene is dimmed on its way to us (extinction) and
// replaced by sunlight that the air scatters toward us (in-scattering).
const vec3  RAYLEIGH = vec3(0.0058, 0.0135, 0.0331);  // per km at sea level, for R, G, B
const float AEROSOL  = 0.008;                          // per km at y = 0; haze, a tuning knob
const float BASE_ALT = 2.0;                            // our y = 0 is ~2 km above sea level

// ∫₀ᵗ exp(-(ro.y + s·rd.y) / H) ds : how much air of scale height H the ray passes through.
float airColumn(vec3 ro, vec3 rd, float t, float H) {
    float k = rd.y / H;
    float len = abs(k * t) > 1e-4 ? (1.0 - exp(-k * t)) / k : t;
    return exp(-ro.y / H) * len;
}

vec3 atmosphere(vec3 col, vec3 ro, vec3 rd, float t) {
    vec3 tau = RAYLEIGH * exp(-BASE_ALT / 8.0) * airColumn(ro, rd, t, 8.0)   // molecules, H = 8 km
             + AEROSOL * airColumn(ro, rd, t, 1.2);                          // aerosols, H = 1.2 km
    vec3 T = exp(-tau);                                                      // transmittance
    vec3 haze = sky(normalize(vec3(rd.x, 0.06, rd.z)));                      // colour of the air
    return col * T + haze * (1.0 - T);
}
`;

CHUNKS.render_8 = `vec3 render(vec3 ro, vec3 rd) {
    float t = raymarch(ro, rd);
    if (t < 0.0) return sky(rd);
    vec3 p = ro + t * rd;
    vec3 n = calcNormal(p, t);
    vec2 tree = trees(p.xz, terrain(p.xz));
    bool isTree = tree.x > 0.0;
    vec3 albedo = isTree ? NEEDLES * (0.7 + 0.6 * tree.y)
                         : groundAlbedo(p, n);
    vec3 col = shade(p, n, albedo, t, 1.0);
    return atmosphere(col, ro, rd, t);
}
`;

// ---------------------------------------------------------------- step 9
CHUNKS.clouds = `// ---- Clouds: a participating medium in a slab of air, plus a cap cloud on the right shoulder.
float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
}
float noise3(vec3 x) {                       // 3D value noise, [0,1]
    vec3 i = floor(x), f = fract(x);
    vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    vec2 e = vec2(1.0, 0.0);
    return mix(mix(mix(hash13(i),        hash13(i + e.xyy), u.x),
                   mix(hash13(i + e.yxy), hash13(i + e.xxy), u.x), u.y),
               mix(mix(hash13(i + e.yyx), hash13(i + e.xyx), u.x),
                   mix(hash13(i + e.yxx), hash13(i + e.xxx), u.x), u.y), u.z);
}
float fbm3(vec3 x, int octaves) {            // ≈ [0,1]
    float sum = 0.0, amp = 0.5;
    for (int i = 0; i < octaves; i++) {
        sum += amp * noise3(x);
        x = 2.03 * x + vec3(13.1, 7.7, 3.3);
        amp *= 0.5;
    }
    return sum;
}

const float CLOUD_LO = 1.60, CLOUD_HI = 3.00;      // slab, km
const float CLOUD_SIGMA = 28.0;                    // extinction per km at density 1
const vec2  WEATHER_OFS = vec2(4.5, 8.5);          // picks which patch of the weather noise we see
const vec3  CAP_C  = vec3(0.90, 1.95, -6.8);   // centre of the cap cloud, km
const vec3  CAP_R  = vec3(1.20, 0.45, 0.80);   // its semi-axes, km

float cloudDensity(vec3 p, int octaves) {
    float h = (p.y - CLOUD_LO) / (CLOUD_HI - CLOUD_LO);
    if (h <= 0.0 || h >= 1.0) return 0.0;
    float profile = smoothstep(0.0, 0.12, h) * smoothstep(1.0, 0.45, h);  // flat base, round top
    vec3  q = (p - CAP_C) / CAP_R;
    float cap = 0.60 * exp(-dot(q, q));            // air forced up the mountain condenses here
    float weather = smoothstep(0.3, 0.8, noise(0.3 * p.xz + WEATHER_OFS));  // where clouds cluster
    float n = fbm3(p * vec3(1.3, 2.0, 1.3) + vec3(0.0, 0.0, 0.5), octaves);    // their puffy shape
    return max(n - 1.0 + uCloud * weather + cap, 0.0) * 6.0 * profile;
}

// Henyey–Greenstein phase function: angular distribution of scattered light, asymmetry g.
float hg(float mu, float g) {
    float d = 1.0 + g * g - 2.0 * g * mu;
    return (1.0 - g * g) / (4.0 * 3.14159265 * d * sqrt(d));
}

// Returns (in-scattered light, transmittance) along the ray, up to distance tScene.
vec4 marchClouds(vec3 ro, vec3 rd, float tScene) {
    float tA = (CLOUD_LO - ro.y) / rd.y, tB = (CLOUD_HI - ro.y) / rd.y;
    float t0 = max(min(tA, tB), 0.0), t1 = max(tA, tB);
    if (tScene > 0.0) t1 = min(t1, tScene);
    t1 = min(t1, t0 + 20.0);
    if (t1 <= t0) return vec4(0.0, 0.0, 0.0, 1.0);

    const int N = 56;
    float dt = (t1 - t0) / float(N);
    float t = t0 + dt * gSeed;                     // jittered start hides banding
    float mu = dot(rd, uSun);
    float phase = mix(hg(mu, 0.6), hg(mu, -0.25), 0.5) * 4.0 * 3.14159265;  // ×4π: isotropic = 1
    vec3 L = vec3(0.0);
    float T = 1.0;
    for (int i = 0; i < N; i++) {
        vec3 p = ro + t * rd;
        float dens = cloudDensity(p, 6);
        if (dens > 0.0) {
            float tauSun = 0.0;                    // optical depth toward the sun
            for (int j = 1; j <= 6; j++) tauSun += cloudDensity(p + uSun * (0.06 * float(j)), 3);
            tauSun *= CLOUD_SIGMA * 0.06;
            float hfrac = (p.y - CLOUD_LO) / (CLOUD_HI - CLOUD_LO);
            vec3 S = SUN_POWER * SUN_COLOR * phase * (exp(-tauSun) + 0.2 * exp(-0.2 * tauSun))
                   + SKY_LIGHT * (1.0 + 2.0 * hfrac);  // ambient skylight, stronger near the top
            float Ti = exp(-CLOUD_SIGMA * dens * dt);   // transmittance of this segment
            L += T * S * (1.0 - Ti);                    // exact for constant density on the segment
            T *= Ti;
            if (T < 0.01) break;
        }
        t += dt;
    }
    return vec4(L, T);
}

// Fraction of sunlight reaching ground point p through the cloud slab (cloud shadows).
float cloudShadow(vec3 p) {
    float t0 = max((CLOUD_LO - p.y) / uSun.y, 0.0), t1 = (CLOUD_HI - p.y) / uSun.y;
    if (t1 <= 0.0) return 1.0;
    float tau = 0.0, dt = (t1 - t0) / 8.0;
    for (int i = 0; i < 8; i++) tau += cloudDensity(p + uSun * (t0 + (float(i) + 0.5) * dt), 3);
    return exp(-CLOUD_SIGMA * tau * dt);
}
`;

CHUNKS.render_9 = `vec3 render(vec3 ro, vec3 rd) {
    float t = raymarch(ro, rd);
    vec3 col;
    if (t < 0.0) {
        col = sky(rd);
    } else {
        vec3 p = ro + t * rd;
        vec3 n = calcNormal(p, t);
        vec2 tree = trees(p.xz, terrain(p.xz));
        bool isTree = tree.x > 0.0;
        vec3 albedo = isTree ? NEEDLES * (0.7 + 0.6 * tree.y)
                             : groundAlbedo(p, n);
        col = shade(p, n, albedo, t, cloudShadow(p));
        col = atmosphere(col, ro, rd, t);
    }
    vec4 cl = marchClouds(ro, rd, t);
    return col * cl.a + cl.rgb;                     // background seen through the cloud + its glow
}
`;

// ---------------------------------------------------------------- step 10
CHUNKS.post_film = `// ---- Output: exposure → filmic tone curve → sRGB → gentle vignette.
const float EXPOSURE   = 0.80;
const float SATURATION = 1.10;

vec3 linearToSRGB(vec3 c) {
    c = clamp(c, 0.0, 1.0);
    return mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
// ACES filmic curve, Narkowicz's rational fit: compresses highlights instead of clipping them.
vec3 aces(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
vec3 post(vec3 c) {
    c = aces(c * EXPOSURE);
    float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = max(mix(vec3(luma), c, SATURATION), 0.0);  // ACES desaturates highlights; give some back
    c = linearToSRGB(c);
    vec2 q = gl_FragCoord.xy / uRes - 0.5;
    return c * (1.0 - 0.35 * dot(q, q));            // vignette
}
`;

// Shadertoy versions of the two host-facing chunks: uniforms become constants, main() becomes mainImage().
CHUNKS.header_shadertoy = `// Paste into the "Image" tab of a new Shadertoy shader.
#define uRes iResolution.xy
const int   uSpp      = 1;          // samples per pixel along each axis; 2–3 removes aliasing (slower)
const vec3  uSun      = vec3(__SUN__);
const float uSnowline = __SNOW__;
const float uTreeline = __TREE__;
const float uCloud    = __CLOUD__;

float gSeed;

float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}
`;

CHUNKS.main_shadertoy = `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec3 sum = vec3(0.0);
    for (int j = 0; j < uSpp; j++)
    for (int i = 0; i < uSpp; i++) {
        vec2 sub = (vec2(i, j) + 0.5) / float(uSpp);
        gSeed = hash12(fragCoord * 1.7 + sub * 113.0);
        sum += render(CAM_POS, cameraRay(fragCoord - 0.5 + sub));
    }
    fragColor = vec4(post(sum / float(uSpp * uSpp)), 1.0);
}
`;

const STEP_CHUNKS = {
  1:  ['header', 'camera', 'sky', 'post_srgb', 'render_1', 'main'],
  2:  ['header', 'camera', 'sky', 'post_srgb', 'massif', 'terrain_v1', 'scene_v1', 'march', 'render_2', 'main'],
  3:  ['header', 'camera', 'sky', 'post_srgb', 'noise', 'massif', 'erosion', 'terrain_v2', 'scene_v1', 'march', 'render_2', 'main'],
  4:  ['header', 'camera', 'sky', 'post_srgb', 'noise', 'massif', 'erosion', 'terrain_v2', 'scene_v1', 'march', 'lighting', 'render_4', 'main'],
  5:  ['header', 'camera', 'sky', 'post_srgb', 'noise', 'massif', 'erosion', 'terrain_v2', 'scene_v1', 'march', 'lighting', 'materials', 'render_5', 'main'],
  6:  ['header', 'camera', 'sky', 'post_srgb', 'noise', 'massif', 'erosion', 'butte', 'terrain_v3', 'scene_v1', 'march', 'lighting', 'materials_v2', 'render_5', 'main'],
  7:  ['header', 'camera', 'sky', 'post_srgb', 'noise', 'massif', 'erosion', 'butte', 'terrain_v3', 'trees', 'march', 'lighting', 'materials_v2', 'render_7', 'main'],
  8:  ['header', 'camera', 'sky', 'post_srgb', 'noise', 'massif', 'erosion', 'butte', 'terrain_v3', 'trees', 'march', 'lighting', 'materials_v2', 'atmosphere', 'render_8', 'main'],
  9:  ['header', 'camera', 'sky', 'post_srgb', 'noise', 'massif', 'erosion', 'butte', 'terrain_v3', 'trees', 'march', 'lighting', 'materials_v2', 'atmosphere', 'clouds', 'render_9', 'main'],
  10: ['header', 'camera', 'sky', 'post_film', 'noise', 'massif', 'erosion', 'butte', 'terrain_v3', 'trees', 'march', 'lighting', 'materials_v2', 'atmosphere', 'clouds', 'render_9', 'main'],
};

// Which chunks replace which: chunks with the same role are versions of one another.
const CHUNK_ROLE = {
  render_1: 'render', render_2: 'render', render_4: 'render', render_5: 'render', render_7: 'render', render_8: 'render', render_9: 'render',
  terrain_v1: 'terrain', terrain_v2: 'terrain', terrain_v3: 'terrain',
  scene_v1: 'scene', trees: 'scene',
  post_srgb: 'post', post_film: 'post',
  materials: 'materials', materials_v2: 'materials',
};
const roleOf = k => CHUNK_ROLE[k] || k;

const DEFAULT_UNIFORMS = {
  uSun: (() => { const v = [0.8529, 0.5000, 0.1504]; const l = Math.hypot(...v); return v.map(c => c / l); })(),
  uSnowline: 1.15,
  uTreeline: 0.95,
  uCloud: 0.25,
};

function shaderForStep(n) { return STEP_CHUNKS[n].map(k => CHUNKS[k]).join('\n'); }

// The same step as a Shadertoy "Image" shader, with the given parameter values baked in.
function shadertoyForStep(n, u = DEFAULT_UNIFORMS) {
  const f = x => (Math.round(x * 1e4) / 1e4).toFixed(4).replace(/0+$/, '0');
  const head = CHUNKS.header_shadertoy
    .replace('__SUN__', u.uSun.map(f).join(', '))
    .replace('__SNOW__', f(u.uSnowline)).replace('__TREE__', f(u.uTreeline)).replace('__CLOUD__', f(u.uCloud));
  return STEP_CHUNKS[n].map(k => k === 'header' ? head : k === 'main' ? CHUNKS.main_shadertoy : CHUNKS[k]).join('\n');
}
if (typeof module !== 'undefined') module.exports = { CHUNKS, STEP_CHUNKS, CHUNK_ROLE, roleOf, DEFAULT_UNIFORMS, shaderForStep, shadertoyForStep };
