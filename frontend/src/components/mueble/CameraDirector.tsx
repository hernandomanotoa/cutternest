import { useRef, useEffect, useCallback } from 'react';
import { CameraControls } from '@react-three/drei';
import type { ElementRef } from 'react';
import * as THREE from 'three';
import type { Point3D } from '../../types';

const SCALE = 0.25;

export interface CameraDirectorProps {
  camera?: Record<string, unknown> | null;
  center: Point3D;
  defaultDistance: number;
  resetKey?: number;
}

function parseCameraTarget(
  camera: Record<string, unknown>,
  fallbackTarget: THREE.Vector3
): { position: THREE.Vector3; target: THREE.Vector3 } {
  const toVec3 = (value: unknown): THREE.Vector3 | null => {
    if (Array.isArray(value) && value.length >= 3) {
      return new THREE.Vector3(Number(value[0]), Number(value[1]), Number(value[2]));
    }
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      if (typeof obj.x === 'number' && typeof obj.y === 'number' && typeof obj.z === 'number') {
        return new THREE.Vector3(obj.x, obj.y, obj.z);
      }
    }
    return null;
  };

  const pos =
    toVec3(camera.position) ??
    toVec3(camera.eye) ??
    new THREE.Vector3(fallbackTarget.x + SCALE * 100, fallbackTarget.y + SCALE * 100, fallbackTarget.z + SCALE * 100);

  const target =
    toVec3(camera.target) ?? toVec3(camera.lookAt) ?? toVec3(camera.center) ?? fallbackTarget;

  return { position: pos, target };
}

export function CameraDirector({ camera, center, defaultDistance, resetKey = 0 }: CameraDirectorProps) {
  const controlsRef = useRef<ElementRef<typeof CameraControls>>(null);

  const applyCamera = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const target = new THREE.Vector3(center.x * SCALE, center.y * SCALE, center.z * SCALE);

    let position: THREE.Vector3;
    let lookAt: THREE.Vector3;

    if (camera) {
      const parsed = parseCameraTarget(camera, target);
      position = parsed.position.clone().multiplyScalar(SCALE);
      lookAt = parsed.target.clone().multiplyScalar(SCALE);
    } else {
      const d = defaultDistance;
      position = new THREE.Vector3(target.x + d, target.y + d, target.z + d);
      lookAt = target;
    }

    controls.setLookAt(position.x, position.y, position.z, lookAt.x, lookAt.y, lookAt.z, true);
  }, [camera, center, defaultDistance]);

  useEffect(() => {
    applyCamera();
  }, [applyCamera, resetKey]);

  return (
    <CameraControls
      ref={controlsRef}
      makeDefault
      minDistance={5}
      maxDistance={Math.max(defaultDistance * 4, 200)}
      maxPolarAngle={Math.PI / 2 - 0.05}
    />
  );
}
