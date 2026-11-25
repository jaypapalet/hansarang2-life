"""Match OSRM routes to the Seoul TOPIS LINK_VERTEX 2025 workbook.

Run with openpyxl, pyproj and shapely 2 installed. The first argument is the
downloaded workbook; the second contains annotated-<destination id>.json
responses from the OSRM car route API (?overview=full&geometries=geojson&annotations=duration,distance).
"""
import json
import math
import sys
from collections import defaultdict
from itertools import groupby, pairwise
from pathlib import Path

from openpyxl import load_workbook
from pyproj import Transformer
from shapely.geometry import LineString
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
transform = Transformer.from_crs("EPSG:4326", "EPSG:5181", always_xy=True).transform


def read_links(workbook):
    sheet = load_workbook(workbook, read_only=True, data_only=True).active
    points = defaultdict(list)
    for key, order, x, y in sheet.iter_rows(min_row=2, values_only=True):
        if isinstance(x, (int, float)) and isinstance(y, (int, float)):
            points[str(key)].append((order, (x, y)))
    return {key: LineString([xy for _, xy in sorted(vertices)])
            for key, vertices in points.items() if len(vertices) > 1}


def vector(line, distance):
    a = line.interpolate(max(0, distance - 8))
    b = line.interpolate(min(line.length, distance + 8))
    return complex(b.x - a.x, b.y - a.y)


def match_link(path, distance, ids, links, index):
    point = path.interpolate(distance)
    direction = vector(path, distance)
    candidates = []
    for i in index.query(point, predicate="dwithin", distance=15):
        link = links[i]
        orientation = vector(link, link.project(point))
        if abs(orientation) and abs(direction):
            dot = (orientation * direction.conjugate()).real / abs(orientation) / abs(direction)
            if dot >= 0.8:
                candidates.append((link.distance(point), ids[i]))
    candidates.sort()
    if not candidates or (len(candidates) > 1 and candidates[1][0] - candidates[0][0] < 4):
        return None
    return candidates[0][1]


def build_route(dest, annotations, road_links):
    source = json.loads((annotations / f"annotated-{dest['id']}.json").read_text())["routes"][0]
    xy = [transform(*point) for point in source["geometry"]["coordinates"]]
    path = LineString(xy)
    entry = source["legs"][0]["annotation"]
    durations = entry["duration"]
    distances = entry["distance"]
    if len(durations) != len(xy) - 1 or len(distances) != len(durations):
        raise ValueError(f"Geometry/annotation mismatch for {dest['id']}")

    ids, links = zip(*[(key, link) for key, link in road_links.items() if link.distance(path) <= 30])
    index = STRtree(links)
    samples = []
    along = 0
    for (a, b), seconds, meters in zip(pairwise(xy), durations, distances):
        length = math.dist(a, b)
        count = max(1, math.ceil(length / 10))
        for index_in_edge in range(count):
            middle = along + (index_in_edge + .5) * length / count
            matched = match_link(path, middle, ids, links, index) if length else None
            samples.append((matched, meters / count, seconds / count))
        along += length

    grouped = defaultdict(lambda: [0, 0])
    distance_factor = source["distance"] / sum(distances)
    time_factor = source["duration"] / sum(durations)
    # Ignore short isolated matches at crossings; every sample belongs to only one link.
    for key, consecutive in groupby(samples, key=lambda item: item[0]):
        segment = list(consecutive)
        meters = sum(item[1] for item in segment) * distance_factor
        seconds = sum(item[2] for item in segment) * time_factor
        accepted = key if key is not None and meters >= 40 else None
        grouped[accepted][0] += meters
        grouped[accepted][1] += seconds

    return {
        "id": dest["id"],
        "meters": source["distance"],
        "baselineSeconds": source["duration"],
        "links": [{"id": key, "meters": round(meters, 2), "baselineSeconds": round(seconds, 3)}
                  for key, (meters, seconds) in grouped.items() if key is not None],
    }


def main():
    workbook, annotations = map(Path, sys.argv[1:])
    places = json.loads((ROOT / "src/road-places.json").read_text())
    links = read_links(workbook)
    routes = [build_route(destination, annotations, links) for destination in places["destinations"]]
    unique = {link["id"] for route in routes for link in route["links"]}
    for route in routes:
        covered = sum(link["meters"] for link in route["links"])
        print(f"{route['id']}: {len(route['links'])} links, {covered / route['meters']:.0%} mapped")
    print(f"Total: {len(unique)} independent TOPIS link lookups")
    (ROOT / "src/topis-routes.json").write_text(json.dumps(routes, indent=2) + "\n")


if __name__ == "__main__":
    main()
