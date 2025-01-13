FROM public.ecr.aws/lambda/python:3.9-arm64

# Install system dependencies
RUN yum update -y && \
    yum install -y \
    gcc \
    gcc-c++ \
    python3-devel

# Base Python packages (fast to install, rarely problematic)
RUN pip install --no-cache-dir \
    pip==24.3.1 \
    wheel==0.45.1 \
    setuptools==69.2.0 \
    numpy==1.23.5 \
    pandas==2.0.3 \
    scipy==1.10.1 \
    boto3==1.26.137

# Visualization packages (matplotlib and dependencies)
RUN pip install --no-cache-dir \
    matplotlib==3.7.1

# Alternative geospatial packages
RUN pip install --no-cache-dir \
    shapely==2.0.1 \
    geopy==2.4.1 \
    pyproj==3.5.0 \
    folium==0.15.1 \
    pycountry==24.6.1

# Copy source code
COPY src/ .

CMD [ "triangulationCalculation.lambda_handler" ]
