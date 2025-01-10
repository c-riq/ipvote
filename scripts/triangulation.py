import pandas as pd
import matplotlib as plt
import os
import json
import numpy as np
from scipy.optimize import minimize

data = []

for file in os.listdir('../s3/triangulation/'):
    if file.endswith('.json'):
        with open(f'../s3/triangulation/{file}', 'r') as f:
            contents = json.load(f)
            data.append(contents)
df = pd.DataFrame(data)

nonce = '8flmlumn6gtzko4ynlbfvb1090uq4yiq2nhj3n7psn5'

lambdaStartTimestamp = int(df[(df.event == 'nonceGeneratedAtMaster') & (df.nonce == nonce)].lambdaStartTimestamp.iloc[0])
nonceSentTime = int(df[(df.event == 'nonceGeneratedAtMaster') & (df.nonce == nonce)].nonceSentTime.iloc[0])

clientStartTimestamp = int(df[~(df.clientStartTimestamp.isna()) & (df.nonce == nonce)].clientStartTimestamp.iloc[0])

clientReceivedNonceTimestamp = int(df[(~df.clientReceivedNonceTimestamp.isna()) & (df.nonce == nonce)].clientReceivedNonceTimestamp.iloc[0])

requestReceived_eu_central_1 = df[(df.awsRegionOfSlave == 'eu-central-1') & (df.nonce == nonce)].lambdaStartTimestamp.iloc[0]
requestReceived_ap_northeast_1 = df[(df.awsRegionOfSlave == 'ap-northeast-1') & (df.nonce == nonce)].lambdaStartTimestamp.iloc[0]
requestReceived_sa_east_1 = df[(df.awsRegionOfSlave == 'sa-east-1') & (df.nonce == nonce)].lambdaStartTimestamp.iloc[0]
requestReceived_us_east_1 = df[(df.awsRegionOfSlave == 'us-east-1') & (df.nonce == nonce)].lambdaStartTimestamp.iloc[0]

time_shift = ((lambdaStartTimestamp - clientStartTimestamp) + (nonceSentTime - clientReceivedNonceTimestamp)) / 2

client_to_eu = requestReceived_eu_central_1 - (clientReceivedNonceTimestamp + time_shift)
client_to_ap = requestReceived_ap_northeast_1 - (clientReceivedNonceTimestamp + time_shift) 
client_to_sa = requestReceived_sa_east_1 - (clientReceivedNonceTimestamp + time_shift) 
client_to_us = requestReceived_us_east_1 - (clientReceivedNonceTimestamp + time_shift) 

print(f'time_shift: {time_shift}',
        f'client_to_eu: {client_to_eu}', f'client_to_ap: {client_to_ap}',
        f'client_to_sa: {client_to_sa}',f'client_to_us: {client_to_us}', nonce[:10])

# coordinates of data centers
DATACENTERS = {
    'eu-central-1': (50.1109, 8.6821),    # Frankfurt
    'ap-northeast-1': (35.6762, 139.6503), # Tokyo
    'sa-east-1': (-23.5505, -46.6333),    # São Paulo
    'us-east-1': (39.0438, -77.4874)      # N. Virginia
}

def haversine_distance(lat1, lon1, lat2, lon2):
    """Calculate the great circle distance between two points on Earth."""
    R = 6371  # Earth's radius in kilometers
    
    lat1, lon1, lat2, lon2 = map(np.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    
    a = np.sin(dlat/2)**2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon/2)**2
    c = 2 * np.arcsin(np.sqrt(a))
    return R * c

def objective_function(coords, latencies):
    """Calculate the sum of squared errors between measured and expected latencies."""
    lat, lon = coords
    error = 0
    
    # Speed of light in fiber optic cable (roughly 2/3 of c)
    c = 200000  # km/s
    
    for region, (dc_lat, dc_lon) in DATACENTERS.items():
        if region in latencies:
            distance = haversine_distance(lat, lon, dc_lat, dc_lon)
            expected_latency = (distance / c) * 1000  # Convert to milliseconds
            error += (expected_latency - latencies[region])**2
            
    return error

def triangulate_position(latencies):
    """Estimate geographical position based on latency measurements."""
    # Initial guess (weighted average of datacenters)
    total_weight = sum(1/lat for lat in latencies.values())
    initial_lat = sum(DATACENTERS[dc][0] / latencies[dc] for dc in latencies) / total_weight
    initial_lon = sum(DATACENTERS[dc][1] / latencies[dc] for dc in latencies) / total_weight
    
    # Optimize to find best position
    result = minimize(
        objective_function,
        x0=[initial_lat, initial_lon],
        args=(latencies,),
        method='Nelder-Mead',
        bounds=[(-90, 90), (-180, 180)]
    )
    
    if result.success:
        return {
            'latitude': result.x[0],
            'longitude': result.x[1],
            'confidence_score': 1 / (1 + result.fun)  # Convert error to confidence score
        }
    else:
        return None

# Example usage with your latency measurements
latencies = {
    'eu-central-1': client_to_eu,
    'ap-northeast-1': client_to_ap,
    'sa-east-1': client_to_sa,
    'us-east-1': client_to_us
}

position = triangulate_position(latencies)
if position:
    print(f"Estimated position: {position['latitude']:.4f}°N, {position['longitude']:.4f}°E")
    print(f"Confidence score: {position['confidence_score']:.4f}")

