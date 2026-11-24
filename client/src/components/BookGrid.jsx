import { Link } from "react-router-dom";
import BookCover from "./BookCover";
import Reveal from "./Reveal";
import { Stars } from "./ui";

// reveal: varian animasi masuk sampul (lihat Reveal); kosong = tanpa animasi.
export function BookCard({ book, footer, linkState, reveal }) {
  return (
    <div className="group flex flex-col">
      <Link to={`/buku/${book._id}`} state={linkState} className="lift block">
        {reveal ? (
          <Reveal variant={reveal}>
            <BookCover book={book} fade />
          </Reveal>
        ) : (
          <BookCover book={book} />
        )}
      </Link>
      <div className="mt-4 min-w-0">
        <Link to={`/buku/${book._id}`} state={linkState} className="book-title line-clamp-2 text-[15px] hover:text-teal">
          {book.judul}
        </Link>
        <p className="mt-0.5 truncate text-xs text-ink-mute">{book.penulis}</p>
        {book.ratingCount > 0 && (
          <p className="mt-1 flex items-center gap-1 text-xs text-ink-soft">
            <Stars value={book.ratingAvg} size={12} /> {book.ratingAvg.toFixed(1)}
          </p>
        )}
        {footer}
      </div>
    </div>
  );
}

// Deretan sampul di atas "rak". Judul di bawah rak.
export default function BookGrid({ books, footer, linkState, reveal }) {
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {books.map((b) => (
        <BookCard key={b._id} book={b} footer={footer?.(b)} linkState={linkState} reveal={reveal} />
      ))}
    </div>
  );
}

export function BookRow({ books }) {
  return (
    <div className="-mx-4 flex snap-x gap-5 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      {books.map((b) => (
        <div key={b._id} className="w-[132px] shrink-0 snap-start sm:w-[150px]">
          <BookCard book={b} />
        </div>
      ))}
    </div>
  );
}
