"""Generates assets/ironbot.glb: a low-poly robot for the 3D Ironbot.

The model is authored here rather than downloaded so the repo owns its asset and
the limb pivots stay named for the renderer. Limb geometry is centred on its joint
in local space and positioned by the node translation, so rotating a node swings
the limb about that joint.
"""

import json
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "ironbot.glb"

# Linear-light equivalents of the SVG brand stops (#D4051F, #FDC923, #67c7eb).
RED = [0.66, 0.005, 0.02, 1.0]
GOLD = [0.98, 0.58, 0.02, 1.0]
VISOR = [0.14, 0.57, 0.83, 1.0]

# (normal, four corners in CCW order seen from outside)
FACES = [
    ((1, 0, 0), [(1, -1, -1), (1, 1, -1), (1, 1, 1), (1, -1, 1)]),
    ((-1, 0, 0), [(-1, -1, 1), (-1, 1, 1), (-1, 1, -1), (-1, -1, -1)]),
    ((0, 1, 0), [(-1, 1, -1), (-1, 1, 1), (1, 1, 1), (1, 1, -1)]),
    ((0, -1, 0), [(-1, -1, 1), (-1, -1, -1), (1, -1, -1), (1, -1, 1)]),
    ((0, 0, 1), [(-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]),
    ((0, 0, -1), [(1, -1, -1), (-1, -1, -1), (-1, 1, -1), (1, 1, -1)]),
]


def box(center, size):
    """24 vertices, 24 normals and 36 indices for an axis-aligned box."""
    cx, cy, cz = center
    sx, sy, sz = (s / 2.0 for s in size)
    positions, normals, indices = [], [], []
    for normal, corners in FACES:
        base = len(positions) // 3
        for x, y, z in corners:
            positions.extend((cx + x * sx, cy + y * sy, cz + z * sz))
            normals.extend(normal)
        indices.extend([base, base + 1, base + 2, base, base + 2, base + 3])
    return positions, normals, indices


# name, node translation (local to the parent node), box centre in local space, box size, material
PARTS = [
    ("body", (0, 0, 0), (0, 0, 0), (0.50, 0.60, 0.32), "red"),
    ("head", (0, 0.52, 0), (0, 0, 0), (0.44, 0.38, 0.38), "red"),
    ("visor", (0, 0.02, 0.20), (0, 0, 0), (0.30, 0.10, 0.04), "visor"),
    ("arm-l", (-0.34, 0.24, 0), (0, -0.26, 0), (0.14, 0.52, 0.14), "gold"),
    ("arm-r", (0.34, 0.24, 0), (0, -0.26, 0), (0.14, 0.52, 0.14), "gold"),
    ("leg-l", (-0.14, -0.28, 0), (0, -0.22, 0), (0.16, 0.44, 0.16), "red"),
    ("leg-r", (0.14, -0.28, 0), (0, -0.22, 0), (0.16, 0.44, 0.16), "red"),
    ("antenna", (0, 0.78, 0), (0, 0, 0), (0.03, 0.16, 0.03), "gold"),
]
HEAD_CHILD = {"head": ["visor"]}
ROOT_CHILDREN = ["body", "head", "arm-l", "arm-r", "leg-l", "leg-r", "antenna"]


def build_glb():
    bin_chunks = []
    offset = 0
    buffer_views, accessors, meshes, nodes = [], [], [], []
    name_to_node = {}

    def view(data, target, pack):
        nonlocal offset
        raw = struct.pack("<%d%s" % (len(data), pack), *data)
        buffer_views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(raw), "target": target})
        bin_chunks.append(raw)
        offset += len(raw)
        return len(buffer_views) - 1

    def accessor(view_index, component_type, count, kind, values=None):
        entry = {"bufferView": view_index, "componentType": component_type, "count": count, "type": kind}
        if values is not None:
            coords = [values[i::3] for i in range(3)]
            entry["min"] = [min(c) for c in coords]
            entry["max"] = [max(c) for c in coords]
        accessors.append(entry)
        return len(accessors) - 1

    materials = {
        "red": {"name": "red", "pbrMetallicRoughness": {"baseColorFactor": RED, "metallicFactor": 0.35, "roughnessFactor": 0.55}},
        "gold": {"name": "gold", "pbrMetallicRoughness": {"baseColorFactor": GOLD, "metallicFactor": 0.75, "roughnessFactor": 0.35}},
        "visor": {"name": "visor", "pbrMetallicRoughness": {"baseColorFactor": VISOR, "metallicFactor": 0.1, "roughnessFactor": 0.2},
                  "emissiveFactor": [0.10, 0.45, 0.60]},
    }
    material_index = {"red": 0, "gold": 1, "visor": 2}

    for name, translation, center, size, material in PARTS:
        positions, normals, indices = box(center, size)
        pos = accessor(view(positions, 34962, "f"), 5126, len(positions) // 3, "VEC3", positions)
        nor = accessor(view(normals, 34962, "f"), 5126, len(normals) // 3, "VEC3")
        idx = accessor(view(indices, 34963, "H"), 5123, len(indices), "SCALAR")
        meshes.append({"name": name, "primitives": [{"attributes": {"POSITION": pos, "NORMAL": nor}, "indices": idx, "material": material_index[material]}]})
        node = {"name": name, "mesh": len(meshes) - 1, "translation": list(translation)}
        name_to_node[name] = len(nodes)
        nodes.append(node)

    for parent, children in HEAD_CHILD.items():
        nodes[name_to_node[parent]]["children"] = [name_to_node[c] for c in children]
    # Inserting the root shifts every part index by one, so remap before adding it.
    for node in nodes:
        if "children" in node:
            node["children"] = [index + 1 for index in node["children"]]
    nodes.insert(0, {"name": "Ironbot", "children": [name_to_node[c] + 1 for c in ROOT_CHILDREN]})

    gltf = {
        "asset": {"version": "2.0", "generator": "make_ironbot_glb.py"},
        "scene": 0,
        "scenes": [{"name": "Ironbot", "nodes": [0]}],
        "nodes": nodes,
        "meshes": meshes,
        "materials": [materials["red"], materials["gold"], materials["visor"]],
        "accessors": accessors,
        "bufferViews": buffer_views,
        "buffers": [{"byteLength": offset}],
    }

    json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    json_bytes += b" " * (-len(json_bytes) % 4)
    bin_bytes = b"".join(bin_chunks)
    bin_bytes += b"\x00" * (-len(bin_bytes) % 4)
    total = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)
    header = struct.pack("<4sII", b"glTF", 2, total)
    return header + struct.pack("<I4s", len(json_bytes), b"JSON") + json_bytes + struct.pack("<I4s", len(bin_bytes), b"BIN\x00") + bin_bytes


def main():
    if "--check" in sys.argv:
        expected = build_glb()
        current = OUT.read_bytes() if OUT.exists() else b""
        print(json.dumps({"current": current == expected, "bytes": len(expected)}))
        if current != expected:
            raise SystemExit(1)
        return
    OUT.write_bytes(build_glb())
    print(json.dumps({"written": True, "bytes": OUT.stat().st_size}))


if __name__ == "__main__":
    main()
