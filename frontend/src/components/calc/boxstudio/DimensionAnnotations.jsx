/**
 * Nhãn kích thước W/L/H (cm) + nhãn mặt/bộ phận trên mesh 3D.
 */
import { Line, Text } from '@react-three/drei';

function fmt(n) {
  const v = Math.round(Number(n) * 10) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export function DimensionAnnotations({ width: w, height: h, length: d }) {
  const gap = Math.max(w, h, d) * 0.12;
  const fontSize = Math.max(0.55, Math.min(w, h, d) * 0.09);
  const y0 = -h / 2;
  const y1 = h / 2;

  const wY = y0 - gap * 0.35;
  const wZ = d / 2 + gap;
  const dX = w / 2 + gap;
  const dY = y0 - gap * 0.35;
  const hX = -w / 2 - gap;

  return (
    <group>
      <Line points={[[-w / 2, wY, wZ], [w / 2, wY, wZ]]} color="#be123c" lineWidth={2} />
      <Line
        points={[
          [-w / 2, wY - fontSize * 0.3, wZ],
          [-w / 2, wY + fontSize * 0.3, wZ],
        ]}
        color="#be123c"
        lineWidth={1.5}
      />
      <Line
        points={[
          [w / 2, wY - fontSize * 0.3, wZ],
          [w / 2, wY + fontSize * 0.3, wZ],
        ]}
        color="#be123c"
        lineWidth={1.5}
      />
      <Text
        position={[0, wY - fontSize * 0.85, wZ]}
        fontSize={fontSize}
        color="#be123c"
        anchorX="center"
        anchorY="middle"
        outlineWidth={fontSize * 0.1}
        outlineColor="#fff"
      >
        {`W ${fmt(w)} cm`}
      </Text>

      <Line points={[[dX, dY, -d / 2], [dX, dY, d / 2]]} color="#0369a1" lineWidth={2} />
      <Line
        points={[
          [dX, dY - fontSize * 0.3, -d / 2],
          [dX, dY + fontSize * 0.3, -d / 2],
        ]}
        color="#0369a1"
        lineWidth={1.5}
      />
      <Line
        points={[
          [dX, dY - fontSize * 0.3, d / 2],
          [dX, dY + fontSize * 0.3, d / 2],
        ]}
        color="#0369a1"
        lineWidth={1.5}
      />
      <Text
        position={[dX + fontSize * 0.9, dY - fontSize * 0.85, 0]}
        fontSize={fontSize}
        color="#0369a1"
        anchorX="center"
        anchorY="middle"
        outlineWidth={fontSize * 0.1}
        outlineColor="#fff"
        rotation={[0, -Math.PI / 2, 0]}
      >
        {`L ${fmt(d)} cm`}
      </Text>

      <Line points={[[hX, y0, d / 2], [hX, y1, d / 2]]} color="#15803d" lineWidth={2} />
      <Line
        points={[
          [hX - fontSize * 0.3, y0, d / 2],
          [hX + fontSize * 0.3, y0, d / 2],
        ]}
        color="#15803d"
        lineWidth={1.5}
      />
      <Line
        points={[
          [hX - fontSize * 0.3, y1, d / 2],
          [hX + fontSize * 0.3, y1, d / 2],
        ]}
        color="#15803d"
        lineWidth={1.5}
      />
      <Text
        position={[hX - fontSize * 0.95, 0, d / 2]}
        fontSize={fontSize}
        color="#15803d"
        anchorX="center"
        anchorY="middle"
        outlineWidth={fontSize * 0.1}
        outlineColor="#fff"
        rotation={[0, 0, Math.PI / 2]}
      >
        {`H ${fmt(h)} cm`}
      </Text>
    </group>
  );
}

/** Nhãn mặt / bộ phận dán trên hộp (billboard). */
export function FacePartLabels({
  width: w,
  height: h,
  length: d,
  family = 'lid_base',
  openT = 0,
}) {
  const fontSize = Math.max(0.45, Math.min(w, h, d) * 0.07);
  const isDrawer = family === 'drawer' || family === 'sleeve_drawer';
  const isDouble = family === 'double_door';
  const isBook = family === 'book';
  const isFlip = family === 'flip_top' || family === 'magnetic';

  const labels = [];

  if (isDrawer) {
    labels.push({ text: 'Sleeve', color: '#7c3aed', pos: [0, h * 0.15, -d * 0.35] });
    labels.push({
      text: 'Khay kéo',
      color: '#d97706',
      pos: [0, 0, d * 0.15 + openT * d * 0.25],
    });
  } else if (isDouble) {
    labels.push({ text: 'Khay trong', color: '#0284c7', pos: [0, -h * 0.05, 0] });
    labels.push({ text: 'Cánh L', color: '#e11d48', pos: [-w * 0.28, h * 0.35, 0] });
    labels.push({ text: 'Cánh R', color: '#e11d48', pos: [w * 0.28, h * 0.35, 0] });
  } else if (isBook) {
    labels.push({ text: 'Khay', color: '#0284c7', pos: [0, 0, 0] });
    labels.push({ text: 'Bìa', color: '#e11d48', pos: [-w * 0.35, h * 0.35, 0] });
  } else if (isFlip) {
    labels.push({ text: 'Thân', color: '#0284c7', pos: [0, 0, d * 0.05] });
    labels.push({
      text: 'Nắp lật',
      color: '#e11d48',
      pos: [0, h * 0.35 + openT * h * 0.2, -d * 0.2],
    });
  } else {
    // lid_base / shoulder / tall / tuck
    labels.push({ text: 'Đáy', color: '#0284c7', pos: [0, -h * 0.05, d * 0.02] });
    labels.push({
      text: 'Nắp',
      color: '#e11d48',
      pos: [0, h * 0.45 + openT * h * 0.15, -d * 0.05],
    });
    labels.push({ text: 'Trước', color: '#0f172a', pos: [0, 0, d / 2 + fontSize * 0.4] });
    labels.push({
      text: 'Trái',
      color: '#059669',
      pos: [-w / 2 - fontSize * 0.35, 0, 0],
      rot: [0, Math.PI / 2, 0],
    });
    labels.push({
      text: 'Phải',
      color: '#d97706',
      pos: [w / 2 + fontSize * 0.35, 0, 0],
      rot: [0, -Math.PI / 2, 0],
    });
  }

  return (
    <group>
      {labels.map((lb) => (
        <Text
          key={lb.text}
          position={lb.pos}
          rotation={lb.rot || [0, 0, 0]}
          fontSize={fontSize}
          color={lb.color}
          anchorX="center"
          anchorY="middle"
          outlineWidth={fontSize * 0.12}
          outlineColor="#ffffff"
          depthOffset={-2}
        >
          {lb.text}
        </Text>
      ))}
    </group>
  );
}
