import { Converter } from "@/components/converter";

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-5xl px-5 pt-14 pb-20 sm:px-8 sm:pt-20">
      <section className="animate-rise mx-auto mb-10 max-w-2xl text-center sm:mb-12">
        <h1 className="font-display text-4xl leading-[1.1] tracking-tight text-balance sm:text-5xl">
          Turn math images into LaTeX
        </h1>
        <p className="text-muted-foreground mx-auto mt-4 max-w-lg text-base leading-relaxed text-pretty sm:text-lg">
          Upload a mathematical expression and get clean, editable LaTeX in
          seconds.
        </p>
      </section>

      <Converter />
    </div>
  );
}
