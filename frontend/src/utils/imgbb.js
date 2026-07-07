export const IMGBB_API_KEY = 'fe67bacbf7586fd5d2c9b4e9d2969332';

export const uploadToImgBB = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      try {
        const base64Data = reader.result.split(',')[1];
        const serverUrl = localStorage.getItem('zihanchat_server_url') || 'https://chaya-pata.onrender.com';
        
        const response = await fetch(`${serverUrl}/api/upload-image`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ image: base64Data }),
        });

        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || 'Failed to upload image via proxy');
        }

        resolve(data.url);
      } catch (error) {
        console.error('Upload Error:', error);
        reject(error);
      }
    };
    reader.onerror = error => reject(error);
  });
};
