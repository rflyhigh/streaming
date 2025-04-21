from flask import Flask, request, Response, stream_with_context
import requests
import logging
import os
import subprocess
import tempfile
from urllib.parse import unquote
from flask_cors import CORS
import time
import shutil
import mimetypes

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes
logging.basicConfig(level=logging.INFO)

CHUNK_SIZE = 1024 * 1024  # 1MB chunks

# Check if ffmpeg is installed
try:
    subprocess.run(['ffmpeg', '-version'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    FFMPEG_AVAILABLE = True
except:
    FFMPEG_AVAILABLE = False
    logging.warning("FFmpeg not found. Installing ffmpeg...")
    # Try to install ffmpeg
    try:
        subprocess.run(['apt-get', 'update'], check=True)
        subprocess.run(['apt-get', 'install', '-y', 'ffmpeg'], check=True)
        FFMPEG_AVAILABLE = True
        logging.info("FFmpeg installed successfully.")
    except Exception as e:
        logging.error(f"Failed to install FFmpeg: {str(e)}")

def is_mkv_or_webm(url):
    """Check if the URL points to an MKV or WebM file."""
    return url.lower().endswith(('.mkv', '.webm')) or 'matroska' in requests.head(url).headers.get('Content-Type', '').lower()

def download_file(url, local_path):
    """Download a file from URL to local path."""
    with requests.get(url, stream=True) as r:
        r.raise_for_status()
        with open(local_path, 'wb') as f:
            for chunk in r.iter_content(chunk_size=8192): 
                f.write(chunk)
    return local_path

def transcode_to_mp4(input_path, output_path):
    """Transcode a video file to MP4 format."""
    try:
        # Use ffmpeg to convert the file to MP4 without re-encoding video (just changing container)
        cmd = [
            'ffmpeg',
            '-i', input_path,
            '-c', 'copy',  # Copy streams without re-encoding
            '-movflags', 'faststart',  # Optimize for web streaming
            '-f', 'mp4',
            output_path
        ]
        
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        return True
    except Exception as e:
        logging.error(f"Transcoding error: {str(e)}")
        return False

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
        
        # Check if it's an MKV or WebM file that needs transcoding
        needs_transcoding = is_mkv_or_webm(video_url)
        
        if needs_transcoding and FFMPEG_AVAILABLE:
            logging.info(f"Transcoding video from {video_url}")
            
            # Create temporary directory
            with tempfile.TemporaryDirectory() as temp_dir:
                # Download the file
                input_file = os.path.join(temp_dir, "input.mkv")
                output_file = os.path.join(temp_dir, "output.mp4")
                
                logging.info(f"Downloading to {input_file}")
                download_file(video_url, input_file)
                
                # Transcode to MP4
                logging.info(f"Transcoding to {output_file}")
                if transcode_to_mp4(input_file, output_file):
                    # Stream the transcoded file
                    logging.info("Streaming transcoded file")
                    
                    # Get file size
                    file_size = os.path.getsize(output_file)
                    
                    # Handle range request
                    start_byte = 0
                    end_byte = file_size - 1
                    
                    if range_header:
                        range_match = range_header.replace('bytes=', '').split('-')
                        if len(range_match) >= 1:
                            start_byte = int(range_match[0] or 0)
                        if len(range_match) >= 2 and range_match[1]:
                            end_byte = min(int(range_match[1]), file_size - 1)
                    
                    # Calculate content length
                    content_length = end_byte - start_byte + 1
                    
                    # Prepare headers
                    response_headers = {
                        'Content-Type': 'video/mp4',
                        'Accept-Ranges': 'bytes',
                        'Content-Length': str(content_length),
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
                        'Access-Control-Allow-Headers': 'Range, Origin, X-Requested-With, Content-Type, Accept'
                    }
                    
                    if range_header:
                        response_headers['Content-Range'] = f'bytes {start_byte}-{end_byte}/{file_size}'
                        status_code = 206
                    else:
                        status_code = 200
                    
                    # Stream the file
                    def generate():
                        with open(output_file, 'rb') as f:
                            f.seek(start_byte)
                            remaining = content_length
                            while remaining > 0:
                                chunk_size = min(CHUNK_SIZE, remaining)
                                data = f.read(chunk_size)
                                if not data:
                                    break
                                remaining -= len(data)
                                yield data
                    
                    return Response(
                        stream_with_context(generate()),
                        status=status_code,
                        headers=response_headers
                    )
                else:
                    return "Failed to transcode video", 500
        else:
            # For non-MKV files or when FFmpeg is not available, use direct streaming
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
                # If it's an octet-stream (generic binary), force it to be video/mp4
                if content_type == 'application/octet-stream':
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
    app.run(host='0.0.0.0', port=10000)
