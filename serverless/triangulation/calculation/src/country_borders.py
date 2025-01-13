import requests
from shapely.geometry import Polygon, MultiPolygon

def load_country_shapes():
    url = "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson"
    response = requests.get(url)
    countries = response.json()
    
    shapes = {}
    for feature in countries['features']:
        iso_code = feature['properties']['ISO_A3']
        if iso_code != '-99':
            try:
                coords = feature['geometry']['coordinates']
                if feature['geometry']['type'] == 'Polygon':
                    poly = Polygon(coords[0])
                    if poly.is_valid:
                        shapes[iso_code] = poly.buffer(0)
                elif feature['geometry']['type'] == 'MultiPolygon':
                    polys = [Polygon(poly[0]) for poly in coords]
                    valid_polys = [p.buffer(0) for p in polys if p.is_valid]
                    if valid_polys:
                        shapes[iso_code] = MultiPolygon(valid_polys)
            except (ValueError, TypeError):
                continue
    
    return shapes 