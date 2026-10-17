import type { MouseEvent } from "react";
import { trackEvent } from "../analytics";
import content from "./drone-content.html?raw";
import "./drone.css";

export default function DroneContent() {
  function trackContact(event: MouseEvent<HTMLDivElement>) {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("a")?.getAttribute("href") === "#contato") {
      trackEvent("cta_primary_click", { page: "/filmagem-com-drone" });
    }
  }

  // Conteúdo editorial versionado, também usado no HTML estático. Não recebe dados de visitantes.
  return <div className="drone-page" onClick={trackContact} dangerouslySetInnerHTML={{ __html: content }} />;
}

export function DroneFeature() {
  return (
    <section className="drone-service-feature section-dark" aria-label="Filmagem com drone">
      <div className="page-shell media-split">
        <figure className="drone-service-image">
          <img src="/media/drones/hero-arquitetura-aerea.webp" alt="Imagem ilustrativa de arquitetura contemporânea vista do alto." width="1536" height="1024" loading="lazy" decoding="async" />
          <figcaption>Imagem ilustrativa</figcaption>
        </figure>
        <div>
          <p className="eyebrow">Filmagem com drone em Goiânia</p>
          <h2>Seu projeto, do alto e de perto.</h2>
          <p className="section-intro">Imagens aéreas, FPV e captação em 360° integradas à produção em solo. Planejamento, direção e edição para apresentar imóveis, empresas, eventos e outros projetos.</p>
          <a className="button primary" href="/filmagem-com-drone" onClick={() => trackEvent("service_view", { service_name: "Filmagem com drone", cta_location: "drone_feature" })}>Conhecer a produção com drone</a>
        </div>
      </div>
    </section>
  );
}
