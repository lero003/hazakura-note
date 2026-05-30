export function SakuraPetals() {
  return (
    <div className="sakura-petals" aria-hidden="true">
      {Array.from({ length: 10 }, (_, index) => (
        <span className="sakura-petal" key={index} />
      ))}
    </div>
  );
}
