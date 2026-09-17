import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  SphereGeometry,
  MeshBasicMaterial,
  LineBasicMaterial,
  Color,
  Mesh,
  Group,
  InstancedMesh,
  Matrix4,
  Raycaster,
  Vector2,
  Vector3,
  BufferGeometry,
  Float32BufferAttribute,
  LineSegments,
} from 'https://esm.sh/three@0.160.0';

function mapLinear(value, inMin, inMax, outMin, outMax) {
  if (inMax === inMin) return outMin;
  const t = (value - inMin) / (inMax - inMin);
  return outMin + t * (outMax - outMin);
}

function mapSpeedUiToInternal(ui) {
  if (ui === 0) return 0;
  return mapLinear(Math.max(0, Math.min(10, ui)), 0, 10, 0, 0.9);
}

function mapScaleUiToMultiplier(ui) {
  return mapLinear(Math.max(1, Math.min(20, ui)), 1, 20, 0.2, 2);
}

function mapDragSpeedUiToSensitivity(ui) {
  return mapLinear(Math.max(0, Math.min(10, ui)), 0, 10, 0.001, 0.02);
}

function latLngToPosition(lat, lng, radius) {
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;
  const x = Math.cos(latRad) * Math.sin(lngRad) * radius;
  const y = Math.sin(latRad) * radius;
  const z = Math.cos(latRad) * Math.cos(lngRad) * radius;
  return { x, y, z };
}

export function createGlobe(container, userConfig = {}) {
  const config = {
    speed: 1.8,
    smoothing: 8,
    dots: { color: '#e2e4e9', size: 5 },
    scale: 8.2,
    stopOnHover: true,
    direction: 'left',
    initialLatitude: 20,
    initialLongitude: -20,
    oceanColor: '#000000',
    outlineColor: 'rgba(255, 255, 255, 0.45)',
    graticuleColor: 'rgba(255, 255, 255, 0.12)',
    dragSpeed: 5,
    ...userConfig,
  };

  const containerWidth = container.clientWidth || container.offsetWidth || 800;
  const containerHeight = container.clientHeight || container.offsetHeight || 500;

  const scene = new Scene();
  const camera = new PerspectiveCamera(50, containerWidth / containerHeight, 0.1, 1e3);

  const scaleMultiplier = mapScaleUiToMultiplier(config.scale);
  const baseRadius = 1;
  const globeRadius = baseRadius * scaleMultiplier;
  const cameraDistance = 2.5 / scaleMultiplier;
  camera.position.set(0, 0, cameraDistance);
  camera.lookAt(0, 0, 0);

  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setSize(containerWidth, containerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = 'srgb';

  const canvas = renderer.domElement;
  canvas.style.position = 'absolute';
  canvas.style.inset = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  canvas.style.cursor = 'grab';
  container.appendChild(canvas);

  const oceanGeometry = new SphereGeometry(globeRadius, 48, 48);
  const oceanMaterial = new MeshBasicMaterial({
    color: new Color(config.oceanColor),
    transparent: true,
    opacity: 0.88,
  });
  const oceanMesh = new Mesh(oceanGeometry, oceanMaterial);

  const globeGroup = new Group();
  const initialLongitudeRad = (config.initialLongitude * Math.PI) / 180;
  const initialLatitudeRad = (config.initialLatitude * Math.PI) / 180;
  globeGroup.rotation.y = initialLongitudeRad;
  globeGroup.rotation.x = initialLatitudeRad;

  scene.add(globeGroup);
  globeGroup.add(oceanMesh);

  // Fast Graticule Grid using LineSegments
  const gridPositions = [];
  const gridSpacing = 15;
  for (let lat = -75; lat <= 75; lat += gridSpacing) {
    for (let lng = -180; lng < 180; lng += 6) {
      const p1 = latLngToPosition(lat, lng, globeRadius * 1.001);
      const p2 = latLngToPosition(lat, lng + 6, globeRadius * 1.001);
      gridPositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    }
  }
  for (let lng = -180; lng < 180; lng += gridSpacing) {
    for (let lat = -80; lat < 80; lat += 6) {
      const p1 = latLngToPosition(lat, lng, globeRadius * 1.001);
      const p2 = latLngToPosition(lat + 6, lng, globeRadius * 1.001);
      gridPositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    }
  }

  const gridGeometry = new BufferGeometry();
  gridGeometry.setAttribute('position', new Float32BufferAttribute(gridPositions, 3));
  const gridMaterial = new LineBasicMaterial({
    color: new Color(0xffffff),
    transparent: true,
    opacity: 0.08,
  });
  const gridSegments = new LineSegments(gridGeometry, gridMaterial);
  globeGroup.add(gridSegments);

  // Instant Load of Coastlines & Dots
  async function loadFastData() {
    try {
      const res = await fetch('./globe_fast_data.json');
      if (!res.ok) throw new Error('Failed to load fast globe data');
      const data = await res.json();

      // 1. Coastlines LineSegments
      const linePositions = [];
      const lines = data.lines || [];
      for (let i = 0; i < lines.length; i++) {
        const [lng1, lat1, lng2, lat2] = lines[i];
        const p1 = latLngToPosition(lat1, lng1, globeRadius * 1.002);
        const p2 = latLngToPosition(lat2, lng2, globeRadius * 1.002);
        linePositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
      }

      const coastGeometry = new BufferGeometry();
      coastGeometry.setAttribute('position', new Float32BufferAttribute(linePositions, 3));
      const coastMaterial = new LineBasicMaterial({
        color: new Color(0xffffff),
        transparent: true,
        opacity: 0.45,
      });
      const coastSegments = new LineSegments(coastGeometry, coastMaterial);
      globeGroup.add(coastSegments);

      // 2. Instanced Land Dots
      const dots = data.dots || [];
      if (dots.length > 0) {
        const dotSize = 0.01 * 0.28;
        const dotGeometry = new SphereGeometry(dotSize, 4, 4);
        const dotMaterial = new MeshBasicMaterial({
          color: new Color(config.dots.color),
          transparent: true,
          opacity: 0.85,
        });
        const instancedMesh = new InstancedMesh(dotGeometry, dotMaterial, dots.length);
        const matrix = new Matrix4();

        for (let i = 0; i < dots.length; i++) {
          const [lng, lat] = dots[i];
          const pos = latLngToPosition(lat, lng, globeRadius * 1.003);
          matrix.makeScale(1, 1, 1);
          matrix.setPosition(pos.x, pos.y, pos.z);
          instancedMesh.setMatrixAt(i, matrix);
        }
        instancedMesh.instanceMatrix.needsUpdate = true;
        globeGroup.add(instancedMesh);
      }

      renderer.render(scene, camera);
    } catch (e) {
      console.warn('Fast globe data fallback:', e);
    }
  }

  loadFastData();

  // Animation & Interaction Loop
  const baseRotationSpeed = mapSpeedUiToInternal(config.speed);
  const rotationSpeed = config.direction === 'left' ? -baseRotationSpeed : baseRotationSpeed;
  const smoothingN = config.smoothing / 10;
  const lerpFactor = smoothingN === 0 ? 1 : mapLinear(smoothingN, 0, 1, 0.4, 0.03);
  const velocityDecay = mapLinear(smoothingN, 0, 1, 0.7, 0.96);

  const rotation = { x: initialLongitudeRad, y: initialLatitudeRad };
  const targetRotation = { x: initialLongitudeRad, y: initialLatitudeRad };
  const velocity = { x: 0, y: 0 };
  let isDragging = false;
  let isHovering = false;
  let lastMouseX = 0;
  let lastMouseY = 0;
  let animationFrameId = null;

  const animate = () => {
    let needsRender = false;
    const threshold = 0.001;

    if (!isDragging && rotationSpeed !== 0 && (!config.stopOnHover || !isHovering)) {
      targetRotation.x += rotationSpeed * 0.01;
    }

    if (!isDragging && smoothingN > 0) {
      if (Math.abs(velocity.x) > threshold || Math.abs(velocity.y) > threshold) {
        targetRotation.x += velocity.x;
        targetRotation.y += velocity.y;
        targetRotation.y = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, targetRotation.y));
        velocity.x *= velocityDecay;
        velocity.y *= velocityDecay;
      } else {
        velocity.x = 0;
        velocity.y = 0;
      }
    }

    const dx = targetRotation.x - rotation.x;
    const dy = targetRotation.y - rotation.y;

    if (Math.abs(dx) > threshold || Math.abs(dy) > threshold || rotationSpeed !== 0 || isDragging) {
      rotation.x += dx * lerpFactor;
      rotation.y += dy * lerpFactor;
      rotation.y = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotation.y));
      needsRender = true;
    }

    if (needsRender || rotationSpeed !== 0 || isDragging) {
      globeGroup.rotation.y = rotation.x;
      globeGroup.rotation.x = rotation.y;
      renderer.render(scene, camera);
    }

    const hasVelocity = Math.abs(velocity.x) > threshold || Math.abs(velocity.y) > threshold;
    const hasLerpDelta = Math.abs(dx) > threshold || Math.abs(dy) > threshold;

    if (isDragging || rotationSpeed !== 0 || hasVelocity || hasLerpDelta) {
      animationFrameId = requestAnimationFrame(animate);
    } else {
      animationFrameId = null;
    }
  };

  const startAnimation = () => {
    if (animationFrameId === null) {
      animationFrameId = requestAnimationFrame(animate);
    }
  };

  startAnimation();

  const handleMouseDown = (event) => {
    isDragging = true;
    canvas.style.cursor = 'grabbing';
    velocity.x = 0;
    velocity.y = 0;
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
    startAnimation();

    const handleMouseMoveDrag = (moveEvent) => {
      const sensitivity = mapDragSpeedUiToSensitivity(config.dragSpeed);
      const dx = moveEvent.clientX - lastMouseX;
      const dy = moveEvent.clientY - lastMouseY;
      targetRotation.x += dx * sensitivity;
      targetRotation.y += dy * sensitivity;
      targetRotation.y = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, targetRotation.y));
      velocity.x = dx * sensitivity * 0.3;
      velocity.y = dy * sensitivity * 0.3;
      lastMouseX = moveEvent.clientX;
      lastMouseY = moveEvent.clientY;
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMoveDrag);
      document.removeEventListener('mouseup', handleMouseUp);
      isDragging = false;
      canvas.style.cursor = 'grab';
    };

    document.addEventListener('mousemove', handleMouseMoveDrag);
    document.addEventListener('mouseup', handleMouseUp);
  };

  canvas.addEventListener('mousedown', handleMouseDown);

  // Mobile Touch Rotation
  const handleTouchStart = (event) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    isDragging = true;
    velocity.x = 0;
    velocity.y = 0;
    lastMouseX = touch.clientX;
    lastMouseY = touch.clientY;
    startAnimation();

    const handleTouchMoveDrag = (moveEvent) => {
      if (moveEvent.touches.length !== 1) return;
      const moveTouch = moveEvent.touches[0];
      const sensitivity = mapDragSpeedUiToSensitivity(config.dragSpeed);
      const dx = moveTouch.clientX - lastMouseX;
      const dy = moveTouch.clientY - lastMouseY;
      targetRotation.x += dx * sensitivity;
      targetRotation.y += dy * sensitivity;
      targetRotation.y = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, targetRotation.y));
      velocity.x = dx * sensitivity * 0.3;
      velocity.y = dy * sensitivity * 0.3;
      lastMouseX = moveTouch.clientX;
      lastMouseY = moveTouch.clientY;
    };

    const handleTouchEnd = () => {
      document.removeEventListener('touchmove', handleTouchMoveDrag);
      document.removeEventListener('touchend', handleTouchEnd);
      isDragging = false;
    };

    document.addEventListener('touchmove', handleTouchMoveDrag, { passive: true });
    document.addEventListener('touchend', handleTouchEnd);
  };

  canvas.addEventListener('touchstart', handleTouchStart, { passive: true });

  const raycaster = new Raycaster();
  const mouse = new Vector2();
  const handleMouseMove = (event) => {
    if (!config.stopOnHover) return;
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(oceanMesh);
    isHovering = intersects.length > 0;
  };
  canvas.addEventListener('mousemove', handleMouseMove);

  const resizeObserver = new ResizeObserver(() => {
    const newWidth = container.clientWidth || container.offsetWidth || 800;
    const newHeight = container.clientHeight || container.offsetHeight || 500;
    camera.aspect = newWidth / newHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(newWidth, newHeight);
    renderer.render(scene, camera);
  });
  resizeObserver.observe(container);

  return {
    destroy: () => {
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      resizeObserver.disconnect();
      renderer.dispose();
      if (container.contains(canvas)) {
        container.removeChild(canvas);
      }
    },
  };
}
