"""Offline structural tests for the generated Ironbot GLB."""

import importlib.util
import json
import struct
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "make_ironbot_glb.py"
spec = importlib.util.spec_from_file_location("make_ironbot_glb", SCRIPT)
glbmod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(glbmod)

EXPECTED_NODES = {"Ironbot", "body", "head", "visor", "arm-l", "arm-r", "leg-l", "leg-r", "antenna"}


def parse(glb):
    magic, version, length = struct.unpack_from("<4sII", glb, 0)
    chunks = []
    at = 12
    while at < length:
        chunk_length, chunk_type = struct.unpack_from("<I4s", glb, at)
        chunks.append((chunk_type, glb[at + 8:at + 8 + chunk_length]))
        at += 8 + chunk_length
    return magic, version, length, chunks


class GlbStructureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.glb = glbmod.build_glb()
        cls.magic, cls.version, cls.length, cls.chunks = parse(cls.glb)
        cls.json_chunk = next(data for kind, data in cls.chunks if kind == b"JSON")
        cls.bin_chunk = next(data for kind, data in cls.chunks if kind == b"BIN\x00")
        cls.gltf = json.loads(cls.json_chunk)

    def test_header_and_chunks(self):
        self.assertEqual(self.magic, b"glTF")
        self.assertEqual(self.version, 2)
        self.assertEqual(self.length, len(self.glb))
        self.assertEqual([kind for kind, _ in self.chunks], [b"JSON", b"BIN\x00"])
        for _, data in self.chunks:
            self.assertEqual(len(data) % 4, 0)

    def test_buffer_fits_the_bin_chunk_and_views_are_aligned(self):
        self.assertLessEqual(self.gltf["buffers"][0]["byteLength"], len(self.bin_chunk))
        for view in self.gltf["bufferViews"]:
            self.assertEqual(view["byteOffset"] % 4, 0)
            self.assertLessEqual(view["byteOffset"] + view["byteLength"], self.gltf["buffers"][0]["byteLength"])

    def test_every_part_is_a_named_node_with_a_mesh(self):
        names = {node.get("name") for node in self.gltf["nodes"]}
        self.assertTrue(EXPECTED_NODES <= names, EXPECTED_NODES - names)
        for node in self.gltf["nodes"]:
            if node.get("name") in EXPECTED_NODES - {"Ironbot"}:
                self.assertIn("mesh", node)
        self.assertEqual(self.gltf["scenes"][0]["nodes"], [0])

    def test_limb_nodes_carry_their_joint_translation(self):
        by_name = {node["name"]: node for node in self.gltf["nodes"]}
        for limb in ("arm-l", "arm-r", "leg-l", "leg-r"):
            self.assertIn("translation", by_name[limb])
        head = by_name["head"]
        self.assertEqual([self.gltf["nodes"][i]["name"] for i in head["children"]], ["visor"])
        root_children = [self.gltf["nodes"][i]["name"] for i in by_name["Ironbot"]["children"]]
        self.assertEqual(root_children, ["body", "head", "arm-l", "arm-r", "leg-l", "leg-r", "antenna"])

    def test_child_translations_are_parent_relative(self):
        # A child translation is applied on top of the parent's, so the visor must
        # sit on the head's front face in world space, not a head-height above it.
        by_name = {node["name"]: node for node in self.gltf["nodes"]}
        head = by_name["head"]["translation"]
        world = [a + b for a, b in zip(head, by_name["visor"]["translation"])]
        head_size = glbmod.PARTS[[p[0] for p in glbmod.PARTS].index("head")][3]
        self.assertLessEqual(abs(world[1] - head[1]), head_size[1] / 2)
        self.assertAlmostEqual(world[2], head_size[2] / 2 + 0.01, delta=0.05)

    def test_accessors_are_well_formed(self):
        for mesh in self.gltf["meshes"]:
            primitive = mesh["primitives"][0]
            position = self.gltf["accessors"][primitive["attributes"]["POSITION"]]
            self.assertEqual(position["type"], "VEC3")
            self.assertIn("min", position)
            self.assertIn("max", position)
            self.assertEqual(len(position["min"]), 3)
            indices = self.gltf["accessors"][primitive["indices"]]
            self.assertEqual(indices["componentType"], 5123)
            self.assertEqual(indices["count"] % 3, 0)
            self.assertLess(max(self._index_values(primitive["indices"])), position["count"])

    def _index_values(self, accessor_index):
        accessor = self.gltf["accessors"][accessor_index]
        view = self.gltf["bufferViews"][accessor["bufferView"]]
        start = view["byteOffset"]
        return list(struct.unpack_from("<%dH" % accessor["count"], self.bin_chunk, start))

    def test_materials_cover_every_primitive(self):
        count = len(self.gltf["materials"])
        for mesh in self.gltf["meshes"]:
            self.assertLess(mesh["primitives"][0]["material"], count)
        emissive = [m for m in self.gltf["materials"] if m["name"] == "visor"][0]
        self.assertIn("emissiveFactor", emissive)


if __name__ == "__main__":
    unittest.main()
