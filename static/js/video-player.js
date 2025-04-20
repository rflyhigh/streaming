// Custom video player functionality
function initializeVideoPlayer(videoElement) {
  if (!videoElement) return;
  
  // Add keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.target.tagName.toLowerCase() === 'input' || e.target.tagName.toLowerCase() === 'textarea') return;
    
    switch(e.key) {
      case ' ':
        e.preventDefault();
        videoElement.paused ? videoElement.play() : videoElement.pause();
        break;
      case 'ArrowRight':
        e.preventDefault();
        videoElement.currentTime += 10;
        break;
      case 'ArrowLeft':
        e.preventDefault();
        videoElement.currentTime -= 10;
        break;
      case 'f':
        e.preventDefault();
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          videoElement.requestFullscreen();
        }
        break;
      case 'm':
        e.preventDefault();
        videoElement.muted = !videoElement.muted;
        break;
    }
  });
  
  // Add play/pause on click
  videoElement.addEventListener('click', () => {
    videoElement.paused ? videoElement.play() : videoElement.pause();
  });
  
  // Add double click for fullscreen
  videoElement.addEventListener('dblclick', () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      videoElement.requestFullscreen();
    }
  });
  
  // Handle video errors
  videoElement.addEventListener('error', (e) => {
    console.error('Video error:', videoElement.error);
    console.error('Error details:', e);
    
    // Check the source
    const source = videoElement.querySelector('source');
    if (source) {
      console.log('Video source URL:', source.src);
    }
    
    const videoContainer = videoElement.parentElement;
    if (videoContainer) {
      videoContainer.innerHTML = `
        <div class="video-error">
          <p>Error streaming video: ${videoElement.error ? videoElement.error.message : 'Unknown error'}</p>
          <p>Please try again later or check the video URL.</p>
        </div>
      `;
    }
  });
  
  // Preload metadata
  videoElement.preload = 'metadata';
  
  // Log when video starts playing
  videoElement.addEventListener('playing', () => {
    console.log('Video started playing');
  });
  
  // Log when video fails to load
  videoElement.addEventListener('loadeddata', () => {
    console.log('Video data loaded successfully');
  });
}