/**
 * API client — bộ ảnh gửi Facebook Messenger (nguồn Drive).
 */
import api from './api';

export const fetchFacebookImageSets = (companyQs = '') =>
  api.get(`/facebook/image-sets${companyQs ? (companyQs.startsWith('?') ? companyQs : `?${companyQs}`) : ''}`).then((r) => r.data);

export const fetchFacebookImageSendSources = (companyQs = '') =>
  api.get(`/facebook/image-send-sources${companyQs ? (companyQs.startsWith('?') ? companyQs : `?${companyQs}`) : ''}`).then((r) => r.data);

export const fetchDriveFolderImagesPreview = ({ folderId, rootId, sync = true }, companyQs = '') => {
  const params = {};
  if (folderId) params.folder_id = folderId;
  if (rootId) params.root_id = rootId;
  if (!sync) params.sync = '0';
  const qs = companyQs ? (companyQs.startsWith('?') ? companyQs.slice(1) : companyQs) : '';
  const extra = new URLSearchParams(qs);
  Object.entries(params).forEach(([k, v]) => extra.set(k, v));
  const tail = extra.toString();
  return api.get(`/facebook/drive-folder-images${tail ? `?${tail}` : ''}`).then((r) => r.data);
};

export const fetchFacebookImageSetsAdmin = () =>
  api.get('/facebook/image-sets/admin').then((r) => r.data);

export const fetchFacebookImageSetImages = (setId, companyQs = '') =>
  api.get(`/facebook/image-sets/${encodeURIComponent(setId)}/images${companyQs ? (companyQs.startsWith('?') ? companyQs : `?${companyQs}`) : ''}`).then((r) => r.data);

export const createFacebookImageSet = (body) =>
  api.post('/facebook/image-sets', body).then((r) => r.data);

export const updateFacebookImageSet = (id, body) =>
  api.put(`/facebook/image-sets/${encodeURIComponent(id)}`, body).then((r) => r.data);

export const deleteFacebookImageSet = (id) =>
  api.delete(`/facebook/image-sets/${encodeURIComponent(id)}`).then((r) => r.data);

export const sendFacebookImageSet = (contactId, setId, companyQs = '') =>
  api.post(
    `/facebook/contacts/${encodeURIComponent(contactId)}/send-image-set${companyQs ? (companyQs.startsWith('?') ? companyQs : `?${companyQs}`) : ''}`,
    { set_id: setId },
  ).then((r) => r.data);

export const sendFacebookDriveFolder = (contactId, { folderId, rootId, label, fileIds }, companyQs = '') =>
  api.post(
    `/facebook/contacts/${encodeURIComponent(contactId)}/send-drive-folder${companyQs ? (companyQs.startsWith('?') ? companyQs : `?${companyQs}`) : ''}`,
    {
      folder_id: folderId || undefined,
      root_id: rootId || undefined,
      label: label || undefined,
      file_ids: fileIds?.length ? fileIds : undefined,
    },
  ).then((r) => r.data);
