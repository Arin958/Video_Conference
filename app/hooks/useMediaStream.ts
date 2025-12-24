import { useCallback, useEffect, useState } from "react"
import { useStore } from "../store/useStore";

export const useMediaStream = () => {
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const {localStream, setLocalStream, isVideoOn, isAudioOn} = useStore();

    const getMediaStream = useCallback(async(constraints: MediaStreamConstraints) => {
         setIsLoading(true);
         setError(null);

         try {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            setLocalStream(stream);
            return stream;
         } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to access media devices.';
            setError(errorMessage);

            // Handle specific permission errors
            if (error instanceof DOMException) {
                if(error.name === 'NotAllowedError') {
                    setError('Permission denied. Please allow access to media devices.');
                } else if (error.name === 'NotFoundError') {
                    setError('No media devices found. Please connect a camera/microphone.');
                } else if(error.name === 'NotReadableError') {
                    setError('Media device is already in use by another application.');
                }
            }
            throw error
          
         } finally {
            setIsLoading(false)
         }
    }, [])


    const startCamera = useCallback(async () => {
    const constraints: MediaStreamConstraints = {
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 60 },
        facingMode: 'user'
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    };

    return getMediaStream(constraints);
  }, [getMediaStream]);







  return {
    localStream,
    error,
    isLoading,
    startCamera,
 
    hasCamera: !!localStream?.getVideoTracks().length,
    hasMicrophone: !!localStream?.getAudioTracks().length
  }
}