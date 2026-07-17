#!/usr/bin/env python3
"""Reconstruct tileable volcanic height maps from matching OpenGL normals.

The runtime already has high-quality albedo/normal/roughness sets for these
surfaces. Fourier-domain normal integration produces a height channel that is
spatially consistent with the authored normal map, then packs R=normal X,
G=normal Y, B=roughness, A=height for the terrain shader.
"""

from pathlib import Path
import argparse

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
TEXTURE_DIR = ROOT / "public/assets/textures/world/floreana-pbr"

LAYERS = {
    "weathered-highland-basalt": {
        "normal": "weathered_highland_basalt_normal_opengl_1024.png",
        "roughness": "weathered_highland_basalt_roughness_1024.png",
        "height": "weathered_highland_basalt_height_1024.png",
        "nrh": "weathered_highland_basalt_nrh_1024.png",
    },
    "oxidized-scoriaceous-basalt": {
        "normal": "oxidized_scoriaceous_basalt_normal_opengl_1024.png",
        "roughness": "oxidized_scoriaceous_basalt_roughness_1024.png",
        "height": "oxidized_scoriaceous_basalt_height_1024.png",
        "nrh": "oxidized_scoriaceous_basalt_nrh_1024.png",
    },
}


def integrate_normal(normal_rgb: np.ndarray) -> np.ndarray:
    normal = normal_rgb.astype(np.float32) / 255.0 * 2.0 - 1.0
    nz = np.maximum(normal[..., 2], 0.16)
    gradient_x = np.clip(-normal[..., 0] / nz, -3.5, 3.5)
    gradient_y = np.clip(normal[..., 1] / nz, -3.5, 3.5)

    height, width = gradient_x.shape
    frequency_x = np.fft.fftfreq(width) * 2.0 * np.pi
    frequency_y = np.fft.fftfreq(height) * 2.0 * np.pi
    omega_x, omega_y = np.meshgrid(frequency_x, frequency_y)
    denominator = omega_x * omega_x + omega_y * omega_y
    denominator[0, 0] = 1.0

    spectrum_x = np.fft.fft2(gradient_x)
    spectrum_y = np.fft.fft2(gradient_y)
    height_spectrum = (
        -1j * omega_x * spectrum_x - 1j * omega_y * spectrum_y
    ) / denominator
    height_spectrum[0, 0] = 0.0
    reconstructed = np.fft.ifft2(height_spectrum).real

    low, high = np.percentile(reconstructed, [1.0, 99.0])
    normalized = np.clip((reconstructed - low) / max(high - low, 1e-6), 0.0, 1.0)
    # A gentle midtone expansion keeps both shallow rope folds and deep scoria
    # vesicles legible after 8-bit packing.
    normalized = np.power(normalized, 0.92)
    return np.round(normalized * 255.0).astype(np.uint8)


def build_layer(layer_name: str) -> None:
    config = LAYERS[layer_name]
    normal = np.asarray(Image.open(TEXTURE_DIR / config["normal"]).convert("RGB"))
    roughness_image = Image.open(TEXTURE_DIR / config["roughness"]).convert("L")
    if roughness_image.size != (normal.shape[1], normal.shape[0]):
        roughness_image = roughness_image.resize(
            (normal.shape[1], normal.shape[0]), Image.Resampling.LANCZOS
        )
    roughness = np.asarray(roughness_image)
    height = integrate_normal(normal)

    Image.fromarray(height, mode="L").save(TEXTURE_DIR / config["height"], optimize=True)
    packed = np.dstack((normal[..., 0], normal[..., 1], roughness, height))
    Image.fromarray(packed.astype(np.uint8), mode="RGBA").save(
        TEXTURE_DIR / config["nrh"], optimize=True
    )
    print(f"Built {config['height']} and {config['nrh']}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("layers", nargs="*")
    args = parser.parse_args()
    requested = args.layers or list(LAYERS)
    unknown = sorted(set(requested) - set(LAYERS))
    if unknown:
        parser.error(f"unknown layer(s): {', '.join(unknown)}")
    for layer_name in requested:
        build_layer(layer_name)


if __name__ == "__main__":
    main()
