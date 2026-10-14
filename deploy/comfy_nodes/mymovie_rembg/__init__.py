"""Small explicit-weight CPU background mask. No downloads or dependency installs at run time."""
from pathlib import Path
import hashlib

MODEL_SHA256 = '309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8'
MODEL_SIZE = 4574861

class MyMovieU2netp:
    @classmethod
    def INPUT_TYPES(cls):
        return {'required': {'image': ('IMAGE',), 'model_name': (['u2netp.onnx'],)}}
    RETURN_TYPES = ('IMAGE', 'MASK')
    RETURN_NAMES = ('white_background', 'foreground_mask')
    FUNCTION = 'remove'
    CATEGORY = 'MyMovie/masks'

    def remove(self, image, model_name):
        import folder_paths
        import numpy as np
        import torch
        from PIL import Image
        import onnxruntime as ort
        if model_name != 'u2netp.onnx': raise ValueError('Use the reviewed u2netp model')
        directories = folder_paths.get_folder_paths('background_removal')
        path = next((Path(p)/model_name for p in directories if (Path(p)/model_name).is_file()), None)
        if path is None: raise ValueError('Initialize u2netp.onnx in models/background_removal first')
        if path.is_symlink() or path.stat().st_size != MODEL_SIZE or hashlib.sha256(path.read_bytes()).hexdigest() != MODEL_SHA256:
            raise ValueError('u2netp integrity mismatch; recheck the reviewed initialization')
        session = ort.InferenceSession(str(path), providers=['CPUExecutionProvider'])
        masks = []
        for frame in image.detach().cpu().numpy():
            rgb = np.clip(frame[..., :3], 0, 1)
            thumb = np.asarray(Image.fromarray((rgb*255).astype(np.uint8)).resize((320,320), Image.Resampling.LANCZOS), dtype=np.float32)
            thumb /= max(float(thumb.max()), 1.0)
            thumb = (thumb - np.array([.485,.456,.406], dtype=np.float32)) / np.array([.229,.224,.225], dtype=np.float32)
            tensor = np.moveaxis(thumb, -1, 0)[None].astype(np.float32)
            prediction = session.run(None, {session.get_inputs()[0].name:tensor})[0][0,0]
            span = float(prediction.max()-prediction.min())
            normalized = (prediction-prediction.min())/span if span>1e-8 else np.zeros_like(prediction)
            mask = Image.fromarray((normalized*255).astype(np.uint8)).resize((frame.shape[1],frame.shape[0]), Image.Resampling.LANCZOS)
            masks.append(np.asarray(mask,dtype=np.float32)/255)
        mask = torch.from_numpy(np.stack(masks)).to(image.device)
        rgb = image[..., :3]
        return (rgb*mask[...,None] + (1-mask[...,None]), mask)

NODE_CLASS_MAPPINGS = {'MyMovieU2netp': MyMovieU2netp}
NODE_DISPLAY_NAME_MAPPINGS = {'MyMovieU2netp':'MyMovie · tiny background removal'}
