import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCatalog } from '../../../context/catalogContext/useCatalog';
import { normalize } from '../../../util/normalize';
import styles from '../header.module.css';

export default function Navegator() {
  const navigate = useNavigate();
  const { products } = useCatalog();
  const [search, setSearch] = useState('');

  const query = search.trim();

  const suggestions =
    query === ''
      ? []
      : products.filter((p) => normalize(p.nombre).includes(normalize(query)));

  // click en una sugerencia 
  function handleSelect(productId: number) {
    navigate(`/producto/${productId}`);
    setSearch('');
  }

  // Enter 
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (query === '') return;
    navigate(`/categorias?buscar=${encodeURIComponent(query)}`);
    setSearch('');
  }

  return (
    <form className={styles.buscadorWrapper} onSubmit={handleSubmit}>
      <svg
        className={styles.iconLupa}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
        <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>

      <input
        type="text"
        placeholder="Buscar productos..."
        className={styles.buscador}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {suggestions.length > 0 && (
        <ul className={styles.listaSugerencias}>
          {suggestions.map((p) => (
            <li key={p.id} onClick={() => handleSelect(p.id)}>
              {p.nombre}
            </li>
          ))}
        </ul>
      )}

      {query !== '' && suggestions.length === 0 && (
        <ul className={styles.listaSugerencias}>
          <li className={styles.sinResultados}>
            {`No encontramos productos para "${query}"`}
          </li>
        </ul>
      )}
    </form>
  );
}