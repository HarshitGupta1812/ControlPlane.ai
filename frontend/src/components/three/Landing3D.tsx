import { Canvas, useFrame } from '@react-three/fiber'
import { Line, Sparkles } from '@react-three/drei'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'

const nodes: [number, number, number][] = [[-2.15, 1.05, 0.35], [2.2, 1.2, -0.25], [-2.5, -1.1, -0.25], [2.35, -1.05, 0.35], [0, 2.2, -0.35], [0.2, -2.05, 0.2], [-1.2, 0.15, -1.35], [1.35, 0.05, -1.15]]
const edgePairs: [number, number][] = [[0, 1], [0, 4], [0, 6], [1, 4], [1, 7], [1, 3], [2, 3], [2, 6], [2, 5], [3, 7], [4, 6], [4, 7], [5, 6], [5, 7]]

function Packet({ from, to, offset, color }: { from: THREE.Vector3; to: THREE.Vector3; offset: number; color: string }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (!ref.current) return
    const progress = (clock.getElapsedTime() * 0.11 + offset) % 1
    ref.current.position.lerpVectors(from, to, progress)
    ref.current.scale.setScalar(0.7 + Math.sin(progress * Math.PI) * 0.55)
  })
  return <mesh ref={ref}><sphereGeometry args={[0.045, 8, 8]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>
}

function NetworkShield() {
  const group = useRef<THREE.Group>(null)
  const core = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    const time = clock.getElapsedTime()
    if (group.current) {
      const scroll = Math.min(window.scrollY / Math.max(window.innerHeight, 1), 2.6)
      group.current.rotation.y = time * 0.12 + scroll * 0.24
      group.current.rotation.x = Math.sin(time * 0.17) * 0.08 + scroll * 0.05
      group.current.position.y = -scroll * 0.14
      group.current.scale.setScalar(1 - Math.min(scroll * 0.08, 0.18))
    }
    if (core.current) core.current.scale.setScalar(1 + Math.sin(time * 1.8) * 0.05)
  })
  const vectorNodes = nodes.map(([x, y, z]) => new THREE.Vector3(x, y, z))
  return <group ref={group}>
    <mesh ref={core}><icosahedronGeometry args={[1.08, 2]} /><meshBasicMaterial color="#ff3b4e" wireframe transparent opacity={0.55} toneMapped={false} /></mesh>
    <mesh scale={0.88}><icosahedronGeometry args={[1.08, 2]} /><meshBasicMaterial color="#ff3b4e" transparent opacity={0.025} side={THREE.DoubleSide} /></mesh>
    <mesh><sphereGeometry args={[0.62, 32, 32]} /><meshStandardMaterial color="#260d16" emissive="#ff3b4e" emissiveIntensity={1.7} roughness={0.35} metalness={0.5} transparent opacity={0.82} /></mesh>
    <mesh rotation={[0.3, 0.2, 0]}><ringGeometry args={[1.34, 1.36, 64]} /><meshBasicMaterial color="#22d3ee" transparent opacity={0.44} side={THREE.DoubleSide} /></mesh>
    {edgePairs.map(([a, b]) => <Line key={`${a}-${b}`} points={[vectorNodes[a], vectorNodes[b]]} color="#22d3ee" transparent opacity={0.17} lineWidth={0.6} />)}
    {nodes.map(([x, y, z], index) => <group key={index} position={[x, y, z]}><mesh><sphereGeometry args={[0.105, 12, 12]} /><meshStandardMaterial color={index % 3 === 0 ? '#22c55e' : '#22d3ee'} emissive={index % 3 === 0 ? '#22c55e' : '#22d3ee'} emissiveIntensity={2.8} toneMapped={false} /></mesh><mesh scale={1.9}><sphereGeometry args={[0.105, 10, 10]} /><meshBasicMaterial color={index % 3 === 0 ? '#22c55e' : '#22d3ee'} transparent opacity={0.1} /></mesh></group>)}
    {edgePairs.map(([a, b], index) => <Packet key={`packet-${index}`} from={vectorNodes[a]} to={vectorNodes[b]} offset={index * 0.13} color={index % 4 === 0 ? '#ff3b4e' : '#22d3ee'} />)}
  </group>
}

function VisibilityCanvas({ children, className = '', camera = { position: [0, 0, 7] as [number, number, number], fov: 42 }, sparkles = true }: { children: ReactNode; className?: string; camera?: { position: [number, number, number]; fov: number }; sparkles?: boolean }) {
  const wrapper = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(true)
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    setMobile(window.matchMedia('(max-width: 640px)').matches)
    const element = wrapper.current
    if (!element || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '120px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return <div ref={wrapper} className={`r3f-visibility-wrap ${className}`}><Canvas frameloop={visible ? 'always' : 'never'} dpr={mobile ? [1, 1.1] : [1, 1.45]} camera={camera} gl={{ antialias: true, alpha: true }}><ambientLight intensity={0.35} /><pointLight color="#ff3b4e" intensity={20} distance={10} position={[0, 0, 2]} /><pointLight color="#22d3ee" intensity={14} distance={8} position={[-4, 2, 1]} />{children}{sparkles && <Sparkles count={mobile ? 22 : 65} scale={7} size={1.4} speed={0.18} color="#ff3b4e" opacity={0.34} />}</Canvas></div>
}

export function Landing3D() {
  return <VisibilityCanvas className="landing-canvas"><NetworkShield /></VisibilityCanvas>
}

function PipelineNodes() {
  const group = useRef<THREE.Group>(null)
  useFrame(({ clock }) => { if (group.current) group.current.rotation.z = Math.sin(clock.getElapsedTime() * 0.2) * 0.015 })
  const points = Array.from({ length: 10 }, (_, index) => new THREE.Vector3(Math.sin(index * 0.75) * 1.3, 2.15 - index * 0.48, 0))
  return <group ref={group}>{points.map((point, index) => <group key={index} position={point}><mesh><sphereGeometry args={[0.13, 16, 16]} /><meshStandardMaterial color={index === 5 ? '#ff3b4e' : index > 7 ? '#22c55e' : '#22d3ee'} emissive={index === 5 ? '#ff3b4e' : '#22d3ee'} emissiveIntensity={2.4} /></mesh>{index < points.length - 1 && <Line points={[new THREE.Vector3(0, 0, 0), points[index + 1].clone().sub(point)]} color={index === 5 ? '#ff3b4e' : '#22d3ee'} opacity={0.4} transparent lineWidth={1.2} />}</group>)}</group>
}

export function Pipeline3D() {
  return <VisibilityCanvas camera={{ position: [0, 0, 6.3], fov: 38 }} sparkles={false}><PipelineNodes /></VisibilityCanvas>
}

function StoryLayers() {
  const group = useRef<THREE.Group>(null)
  useFrame(({ clock }) => { if (group.current) group.current.rotation.y = clock.getElapsedTime() * 0.13 })
  return <group ref={group} rotation={[0.25, 0, 0]}>
    <mesh><icosahedronGeometry args={[0.88, 1]} /><meshBasicMaterial color="#ff3b4e" wireframe transparent opacity={0.4} toneMapped={false} /></mesh>
    <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[1.18, 0.018, 8, 64]} /><meshBasicMaterial color="#22c55e" transparent opacity={0.75} toneMapped={false} /></mesh>
    <mesh rotation={[Math.PI / 2, 0.45, 0]}><torusGeometry args={[1.43, 0.018, 8, 64]} /><meshBasicMaterial color="#f59e0b" transparent opacity={0.74} toneMapped={false} /></mesh>
    <mesh rotation={[Math.PI / 2, -0.35, 0]}><torusGeometry args={[1.68, 0.018, 8, 64]} /><meshBasicMaterial color="#22d3ee" transparent opacity={0.72} toneMapped={false} /></mesh>
    <mesh><sphereGeometry args={[0.38, 24, 24]} /><meshStandardMaterial color="#260d16" emissive="#ff3b4e" emissiveIntensity={1.3} /></mesh>
  </group>
}

export function StoryScene() {
  return <VisibilityCanvas className="story-r3f" camera={{ position: [0, 0, 5.2], fov: 42 }} sparkles={false}><StoryLayers /></VisibilityCanvas>
}
