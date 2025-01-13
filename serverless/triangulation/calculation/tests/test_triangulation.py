import pytest
from src.triangulationCalculation import lambda_handler

def test_lambda_handler_missing_ip():
    event = {}
    result = lambda_handler(event, None)
    assert result['statusCode'] == 400
    assert 'IP address is required' in result['body']

def test_lambda_handler_valid_ip():
    event = {'ip': '123.45.67.89'}
    result = lambda_handler(event, None)
    assert result['statusCode'] == 200
    assert 'isBase64Encoded' in result
    assert result['isBase64Encoded'] is True
