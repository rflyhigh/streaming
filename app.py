from flask import Flask, request, Response, stream_with_context
import requests
import logging
from urllib.parse import unquote
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes
logging.basicConfig(level=logging.INFO)

CHUNK_SIZE = 1024 * 1024  # 1MB chunks

@app.route('/stream')
def stream_video():
    video_url = request.args.get('url')
    if not video_url:
        return "No URL provided", 400
    
    video_url = unquote(video_url)
    
    try:
        # Get range header if present
        range_header = request.headers.get('Range')
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        if range_header:
            headers['Range'] = range_header
        
        # Make a HEAD request to get content info
        head_response = requests.head(video_url, headers=headers, allow_redirects=True, timeout=30)
        
        # Prepare headers for our response
        response_headers = {
            'Content-Type': 'video/mp4',  # Default to MP4
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': 'Range, Origin, X-Requested-With, Content-Type, Accept'
        }
        
        # Copy content type if available
        if 'Content-Type' in head_response.headers:
            content_type = head_response.headers['Content-Type']
            # If it's an octet-stream (generic binary) or mkv, force it to be video/mp4
            if content_type == 'application/octet-stream' or 'matroska' in content_type.lower():
                content_type = 'video/mp4'
            response_headers['Content-Type'] = content_type
        
        # Copy content length if available
        if 'Content-Length' in head_response.headers:
            response_headers['Content-Length'] = head_response.headers['Content-Length']
        
        # Copy content range if available
        if 'Content-Range' in head_response.headers:
            response_headers['Content-Range'] = head_response.headers['Content-Range']
        
        # Determine status code (206 for partial content with range)
        status_code = head_response.status_code
        if range_header and status_code == 200:
            status_code = 206  # Change to partial content if server doesn't support range
        
        # Stream the video in chunks
        def generate():
            try:
                # Use streaming GET request
                with requests.get(video_url, headers=headers, stream=True, allow_redirects=True, timeout=30) as r:
                    r.raise_for_status()  # Raise an exception for 4XX/5XX responses
                    for chunk in r.iter_content(chunk_size=CHUNK_SIZE):
                        if chunk:
                            yield chunk
            except Exception as stream_error:
                logging.error(f"Streaming error: {str(stream_error)}")
                # Return empty to end stream
        
        return Response(
            stream_with_context(generate()),
            status=status_code,
            headers=response_headers
        )
    
    except Exception as e:
        logging.error(f"Error: {str(e)}")
        return f"Error streaming video: {str(e)}", 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=10000)  # Changed to match your port in logs
