import axios from './client';

export interface CollectionData {
  orderId: string;
  waybillImage: string; // Base64
  signature: string;    // Base64
  location?: {
    lat: number;
    lng: number;
  };
}

export const collectionApi = {
  uploadPOC: async (data: CollectionData) => {
    // 1. Convert Base64 to Blobs for real file upload
    const waybillBlob = await (await fetch(data.waybillImage)).blob();
    const signatureBlob = await (await fetch(data.signature)).blob();

    const formData = new FormData();
    formData.append('file', waybillBlob, `waybill-${data.orderId}.jpg`);
    formData.append('signature', signatureBlob, `sig-${data.orderId}.png`);
    formData.append('orderId', data.orderId);
    
    if (data.location) {
      formData.append('lat', data.location.lat.toString());
      formData.append('lng', data.location.lng.toString());
    }

    // 2. Hit your existing Waybill Inbox upload endpoint
    // We target the hardened production route we verified earlier
    return axios.post('/api/waybills/inbox/upload', formData);
  }
};
