export const IMGBB_API_KEY = 'fe67bacbf7586fd5d2c9b4e9d2969332';

/**
 * Uploads an image file to ImgBB and returns the URL.
 * @param {File} file - The image file to upload
 * @returns {Promise<string>} - The uploaded image URL
 */
export const uploadToImgBB = async (file) => {
  const formData = new FormData();
  formData.append('image', file);

  try {
    const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Failed to upload image to ImgBB');
    }

    const data = await response.json();
    return data.data.url;
  } catch (error) {
    console.error('ImgBB Upload Error:', error);
    throw error;
  }
};
