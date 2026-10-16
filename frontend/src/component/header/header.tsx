import BarTop from './component/barTop';
import BarLower from './component/barLower';

export default function Header() {
  return (
    <nav>
      <BarTop />
      <BarLower />
    </nav>
  );
}