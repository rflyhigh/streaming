from flask import Flask, request, Response, stream_with_context, jsonify
import requests
import logging
import os
import subprocess
import tempfile
import hashlib
import time
import threading
from urllib.parse import unquote
from flask_cors import CORS
import shutil

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes
logging.basicConfig(level=logging.INFO)

# Configuration
CHUNK_SIZE = 1024 * 1024  # 1MB chunks
CACHE_DIR = "/tmp/video_cache"  # Persistent cache directory
MAX_CACHE_SIZE = 10 * 1024 * 1024 * 1024  # 10GB max cache size
TRANSCODING_JOBS = {}  # Track ongoing transcoding jobs
LOCK = threading.Lock()  # Lock for thread safety

# Create cache directory if it doesn't exist
os.makedirs(CACHE_DIR, exist_ok=True)

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

def get_cache_path(url):
    """Generate a unique cache path based on the URL."""
    url_hash = hashlib.md5(url.encode()).hexdigest()
    return os.path.join(CACHE_DIR, f"{url_hash}.mp4")

def is_file_cached(url):
    """Check if a file is already cached."""
    cache_path = get_cache_path(url)
    return os.path.exists(cache_path) and os.path.getsize(cache_path) > 0

def clean_cache():
    """Clean the cache if it exceeds the maximum size."""
    total_size = 0
    files = []
    
    # Get all files with their modification times
    for filename in os.listdir(CACHE_DIR):
        file_path = os.path.join(CACHE_DIR, filename)
        if os.path.isfile(file_path):
            file_size = os.path.getsize(file_path)
            mod_time = os.path.getmtime(file_path)
            total_size += file_size
            files.append((file_path, mod_time, file_size))
    
    # If cache exceeds max size, remove oldest files
    if total_size > MAX_CACHE_SIZE:
        # Sort by modification time (oldest first)
        files.sort(key=lambda x: x[1])
        
        # Remove files until we're under the limit
        for file_path, _, file_size in files:
            try:
                os.remove(file_path)
                total_size -= file_size
                logging.info(f"Removed {file_path} from cache")
                if total_size <= MAX_CACHE_SIZE * 0.8:  # Clean until we're at 80%
                    break
            except Exception as e:
                logging.error(f"Error removing {file_path}: {str(e)}")

def download_file(url, local_path):
    """Download a file from URL to local path."""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        with requests.get(url, stream=True, headers=headers) as r:
            r.raise_for_status()
            with open(local_path, 'wb') as f:
                for chunk in r.iter_content(chunk_size=8192): 
                    f.write(chunk)
        return True
    except Exception as e:
        logging.error(f"Download error: {str(e)}")
        return False

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

def transcode_job(video_url, job_id):
    """Background job to transcode a video."""
    try:
        cache_path = get_cache_path(video_url)
        temp_dir = tempfile.mkdtemp()
        input_file = os.path.join(temp_dir, "input.mkv")
        output_file = os.path.join(temp_dir, "output.mp4")
        
        # Update job status
        with LOCK:
            TRANSCODING_JOBS[job_id]['status'] = 'downloading'
            TRANSCODING_JOBS[job_id]['progress'] = 10
        
        # Download the file
        logging.info(f"Downloading {video_url} to {input_file}")
        if not download_file(video_url, input_file):
            with LOCK:
                TRANSCODING_JOBS[job_id]['status'] = 'failed'
                TRANSCODING_JOBS[job_id]['error'] = 'Download failed'
            shutil.rmtree(temp_dir, ignore_errors=True)
            return
        
        # Update job status
        with LOCK:
            TRANSCODING_JOBS[job_id]['status'] = 'transcoding'
            TRANSCODING_JOBS[job_id]['progress'] = 40
        
        # Transcode to MP4
        logging.info(f"Transcoding to {output_file}")
        if not transcode_to_mp4(input_file, output_file):
            with LOCK:
                TRANSCODING_JOBS[job_id]['status'] = 'failed'
                TRANSCODING_JOBS[job_id]['error'] = 'Transcoding failed'
            shutil.rmtree(temp_dir, ignore_errors=True)
            return
        
        # Move to cache
        logging.info(f"Moving to cache {cache_path}")
        os.makedirs(os.path.dirname(cache_path), exist_ok=True)
        shutil.move(output_file, cache_path)
        
        # Clean up
        shutil.rmtree(temp_dir, ignore_errors=True)
        
        # Update job status
        with LOCK:
            TRANSCODING_JOBS[job_id]['status'] = 'completed'
            TRANSCODING_JOBS[job_id]['progress'] = 100
            TRANSCODING_JOBS[job_id]['cache_path'] = cache_path
        
        # Clean cache if needed
        clean_cache()
        
    except Exception as e:
        logging.error(f"Transcode job error: {str(e)}")
        with LOCK:
            TRANSCODING_JOBS[job_id]['status'] = 'failed'
            TRANSCODING_JOBS[job_id]['error'] = str(e)
        shutil.rmtree(temp_dir, ignore_errors=True)

def is_mkv_or_webm(url):
    """Check if the URL points to an MKV or WebM file."""
    if url.lower().endswith(('.mkv', '.webm')):
        return True
    
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        response = requests.head(url, headers=headers, timeout=10)
        content_type = response.headers.get('Content-Type', '').lower()
        return 'matroska' in content_type or 'webm' in content_type
    except:
        # If we can't determine, assume it's not MKV/WebM
        return False

@app.route('/status/<job_id>')
def job_status(job_id):
    """Get the status of a transcoding job."""
    with LOCK:
        if job_id in TRANSCODING_JOBS:
            return jsonify(TRANSCODING_JOBS[job_id])
        else:
            return jsonify({'status': 'not_found'}), 404

@app.route('/transcode')
def transcode_video():
    """Start a transcoding job."""
    video_url = request.args.get('url')
    if not video_url:
        return jsonify({'error': 'No URL provided'}), 400
    
    video_url = unquote(video_url)
    
    # Generate a job ID
    job_id = hashlib.md5((video_url + str(time.time())).encode()).hexdigest()
    
    # Check if already cached
    if is_file_cached(video_url):
        return jsonify({
            'job_id': job_id,
            'status': 'completed',
            'progress': 100,
            'cache_path': get_cache_path(video_url)
        })
    
    # Create a new job
    with LOCK:
        TRANSCODING_JOBS[job_id] = {
            'job_id': job_id,
            'video_url': video_url,
            'status': 'queued',
            'progress': 0,
            'start_time': time.time()
        }
    
    # Start transcoding in a background thread
    thread = threading.Thread(target=transcode_job, args=(video_url, job_id))
    thread.daemon = True
    thread.start()
    
    return jsonify({
        'job_id': job_id,
        'status': 'queued',
        'progress': 0
    })

@app.route('/stream')
def stream_video():
    """Stream a video, with transcoding if needed."""
    video_url = request.args.get('url')
    job_id = request.args.get('job_id')
    
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
        
        # Check if it's an MKV or WebM file that needs transcoding
        needs_transcoding = is_mkv_or_webm(video_url)
        
        if needs_transcoding and FFMPEG_AVAILABLE:
            # Check if already cached
            cache_path = get_cache_path(video_url)
            
            if not is_file_cached(video_url):
                # If not cached and no job ID, return error
                if not job_id:
                    return jsonify({
                        'error': 'Video needs transcoding first',
                        'needs_transcoding': True
                    }), 400
                
                # Check job status
                with LOCK:
                    if job_id not in TRANSCODING_JOBS:
                        return jsonify({
                            'error': 'Invalid job ID',
                            'needs_transcoding': True
                        }), 400
                    
                    job = TRANSCODING_JOBS[job_id]
                    if job['status'] == 'failed':
                        return jsonify({
                            'error': f"Transcoding failed: {job.get('error', 'Unknown error')}",
                            'needs_transcoding': True
                        }), 500
                    
                    if job['status'] != 'completed':
                        return jsonify({
                            'status': job['status'],
                            'progress': job['progress'],
                            'needs_transcoding': True
                        }), 202  # Accepted but not ready
            
            # If we get here, the file is cached or the job is completed
            # Stream the cached file
            file_size = os.path.getsize(cache_path)
            
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
                with open(cache_path, 'rb') as f:
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
        return jsonify({'error': f"Error streaming video: {str(e)}"}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=10000)
