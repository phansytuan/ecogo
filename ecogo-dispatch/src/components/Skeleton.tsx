export function SkeletonRows({ n = 4 }: { n?: number }) {
  return (
    <>
      {Array.from({ length: n }).map((_, i) => (
        <div className="skel-row" key={i}>
          <div className="skel skel-line" style={{ width: '70%' }} />
          <div className="skel skel-line" style={{ width: '45%', marginBottom: 0 }} />
        </div>
      ))}
    </>
  );
}
