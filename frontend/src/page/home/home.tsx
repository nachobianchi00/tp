// src/page/home/home.tsx
import CategoryCarousel from './component/categoryCarousel';
import BrandsSection from './component/brandsSection';

export default function Home() {
  return (
    <>
      <CategoryCarousel />
      <BrandsSection />
    </>
  );
}