import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/manrope/latin-800.css";
import "./App.css";
import { getCampaignContext, trackEvent } from "./analytics";
import { CITY, CNPJ, EMAIL, GA4_ID, HARAS_ADDRESS, LEGAL_NAME, MAPS_URL, SITE_NAME, TAGLINE, WHATSAPP_DISPLAY, whatsappLink, whatsappMessageLink } from "./config/site";
import { proof } from "./config/proof";
import { podcastGallery } from "./content/podcast-gallery";
import {
  faq,
  evidenceCases,
  flagshipOffers,
  harasApplications,
  harasFacts,
  intentRoutes,
  legacyServiceDetails,
  methodSteps,
  podcastConsulting,
  principles,
  projectOptions,
  relatedJourneys,
  siteConfig,
  solutionFamilies,
  visualStories,
} from "./content";

type LeadForm = {
  name: string;
  role: string;
  phone: string;
  email: string;
  company: string;
  project: string;
  brief: string;
  date: string;
};

const initialLead: LeadForm = { name: "", role: "", phone: "", email: "", company: "", project: "", brief: "", date: "" };

function pageInterest(path = window.location.pathname) {
  if (path === "/podcast" && window.location.hash === "#itinerante") return "Podcast itinerante em feira, congresso ou evento";
  if (path === "/podcast" && window.location.hash === "#ao-vivo") return "Transmissão ao vivo";
  const interests: Record<string, string> = { "/": "Ainda preciso entender a melhor solução", "/podcast": "Gravação de podcast (gravado ou ao vivo)", "/haras-sobi": "Haras SOBI", "/leilao-360": "Leilão 360", "/consultoria-podcast": "Consultoria e implantação de estúdio de podcast", "/filme-de-legado": "Filme de marca ou legado", "/solucoes": "Operação de conteúdo", "/metodo": "Ainda preciso entender a melhor solução", "/sobre": "Ainda preciso entender a melhor solução" };
  return interests[path.replace(/\/+$/, "") || "/"] ?? "Ainda preciso entender a melhor solução";
}

function usePageMeta(title: string, description: string) {
  useEffect(() => {
    document.title = title;
    const path = window.location.pathname.replace(/\/+$/, "") || "/";
    const canonicalUrl = `https://${siteConfig.domain}${path === "/" ? "/" : path}`;
    const setMeta = (selector: string, content: string) => {
      const meta = document.querySelector<HTMLMetaElement>(selector);
      if (meta) meta.content = content;
    };
    setMeta('meta[name="description"]', description);
    setMeta('meta[property="og:title"]', title);
    setMeta('meta[property="og:description"]', description);
    setMeta('meta[property="og:url"]', canonicalUrl);
    setMeta('meta[name="twitter:title"]', title);
    setMeta('meta[name="twitter:description"]', description);
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) canonical.href = canonicalUrl;
    trackEvent("page_view", { page_title: title });
  }, [title, description]);
}

function useAnalyticsAndSchema() {
  useEffect(() => {
    if (GA4_ID && !document.getElementById("ga4-script")) {
      const script = document.createElement("script");
      script.id = "ga4-script";
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`;
      document.head.append(script);
      window.dataLayer ??= [];
      window.gtag = (...args) => window.dataLayer?.push(args as unknown as Record<string, string>);
      window.gtag("js", new Date());
      window.gtag("config", GA4_ID);
    }
    const schema = { "@context": "https://schema.org", "@graph": [
      { "@type": "LocalBusiness", name: SITE_NAME, ...(LEGAL_NAME.startsWith("TODO") ? {} : { legalName: LEGAL_NAME }), taxID: CNPJ, telephone: "+55 62 9835-4354", email: EMAIL, url: `https://${siteConfig.domain}`, address: { "@type": "PostalAddress", addressLocality: "Goiânia", addressRegion: "GO", addressCountry: "BR" }, areaServed: "BR" },
      { "@type": "Place", name: "Haras SOBI", description: HARAS_ADDRESS },
    ] };
    let node = document.getElementById("ar1-local-business-schema") as HTMLScriptElement | null;
    if (!node) { node = document.createElement("script"); node.id = "ar1-local-business-schema"; node.type = "application/ld+json"; document.head.append(node); }
    node.textContent = JSON.stringify(schema);
  }, []);
}

function Logo({ compact = false }: { compact?: boolean }) {
  return <img className={compact ? "logo compact" : "logo"} src="/media/ar1-films-logo.png" alt="AR1 Films" />;
}

function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const path = window.location.pathname.replace(/\/+$/, "") || "/";

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    const updateHeader = () => setScrolled(window.scrollY > 24);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("scroll", updateHeader, { passive: true });
    updateHeader();
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("scroll", updateHeader);
    };
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    if (open) document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const menuButton = menuButtonRef.current;
    const links = Array.from(navRef.current?.querySelectorAll<HTMLElement>("a[href]") ?? []);
    const focusable = [menuButton, ...links].filter((item): item is HTMLElement => Boolean(item));
    const focusFrame = window.requestAnimationFrame(() => links[0]?.focus());
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trapFocus);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", trapFocus);
      menuButton?.focus();
    };
  }, [open]);

  const current = (href: string) => path === href ? "page" as const : undefined;

  return (
    <header className={`site-header ${scrolled ? "scrolled" : ""}`}>
      <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
      <a className="brand-link" href="/" aria-label={`${SITE_NAME}, início`}><Logo /></a>
      <button ref={menuButtonRef} className="menu-button" onClick={() => setOpen(!open)} aria-controls="main-navigation" aria-expanded={open} aria-label={open ? "Fechar menu" : "Abrir menu"}><span aria-hidden="true" /><span aria-hidden="true" /></button>
      {open && <button className="menu-backdrop" type="button" tabIndex={-1} aria-label="Fechar menu" onClick={() => setOpen(false)} />}
      <nav ref={navRef} id="main-navigation" className={open ? "nav open" : "nav"} aria-label="Navegação principal">
        <a href="/" aria-current={current("/")} onClick={() => setOpen(false)}>Home</a>
        <a href="/podcast" aria-current={current("/podcast")} onClick={() => setOpen(false)}>Podcast</a>
        <a href="/consultoria-podcast" aria-current={current("/consultoria-podcast")} onClick={() => setOpen(false)}>Consultoria</a>
        <a href="/haras-sobi" aria-current={current("/haras-sobi")} onClick={() => setOpen(false)}>Haras SOBI</a>
        <a href="/leilao-360" aria-current={current("/leilao-360")} onClick={() => setOpen(false)}>Leilão 360</a>
        <a href="/solucoes" aria-current={current("/solucoes")} onClick={() => setOpen(false)}>Soluções</a>
        <a href="/sobre" aria-current={current("/sobre")} onClick={() => setOpen(false)}>Sobre</a>
        <a href="#contato" className="nav-cta" onClick={() => { trackEvent("cta_primary_click", { page: path }); setOpen(false); }}>Solicitar proposta</a>
        <a href={whatsappLink("o projeto desta página")} className="header-whatsapp" aria-label="Falar no WhatsApp" onClick={() => trackEvent("whatsapp_click", { location: "header", page: path, interest: pageInterest(path) })}>WhatsApp</a>
      </nav>
    </header>
  );
}

function Footer() {
  const socialLinks = [
    ["Instagram", siteConfig.instagramUrl],
    ["YouTube", siteConfig.youtubeUrl],
    ["LinkedIn", siteConfig.linkedinUrl],
  ].filter(([, url]) => Boolean(url));

  return (
    <footer className="footer">
      <div className="footer-brand"><Logo compact /><p>{TAGLINE}</p><p>{CITY}</p></div>
      <div className="footer-nav" aria-label="Soluções">
        <span>Soluções</span><a href="/podcast">Podcast</a><a href="/consultoria-podcast">Consultoria de estúdio</a><a href="/podcast#ao-vivo">Transmissão ao vivo</a><a href="/haras-sobi">Haras SOBI</a><a href="/leilao-360">Leilão 360</a><a href="/filme-de-legado">Filme de Legado</a><p>{HARAS_ADDRESS}</p>{MAPS_URL ? <a href={MAPS_URL} target="_blank" rel="noreferrer">Ver no mapa</a> : null}<a href="/metodo">Método</a>
      </div>
      <div className="footer-contact"><span>Contato</span><a href={whatsappLink("uma proposta")}>{WHATSAPP_DISPLAY}</a><a href={`mailto:${EMAIL}`}>{EMAIL}</a>{socialLinks.map(([label, url]) => <a key={label} href={url}>{label}</a>)}</div>
      <small>CNPJ {CNPJ} · © {new Date().getFullYear()} {SITE_NAME}. Todos os direitos reservados.</small>
    </footer>
  );
}

function WhatsAppFloat({ interest }: { interest: string }) {
  return <a className="whatsapp-float" href={whatsappLink(interest)} aria-label="Falar no WhatsApp" onClick={() => trackEvent("whatsapp_click", { location: "float", page: window.location.pathname, interest })}>WhatsApp</a>;
}

function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = element.current;
    if (!node) return;
    if (!("IntersectionObserver" in window)) {
      node.classList.add("visible");
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        node.classList.add("visible");
        observer.disconnect();
      }
    }, { threshold: 0.08, rootMargin: "0px 0px -24px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <div ref={element} className={`reveal ${className}`}>{children}</div>;
}

function ContactForm({ defaultProject = "" }: { defaultProject?: string }) {
  const [lead, setLead] = useState<LeadForm>({ ...initialLead, project: projectOptions.includes(defaultProject as typeof projectOptions[number]) ? defaultProject : "" });
  const [status, setStatus] = useState("");
  const started = useRef(false);
  const update = (field: keyof LeadForm, value: string) => setLead((current) => ({ ...current, [field]: value }));

  const registerStart = () => {
    if (started.current) return;
    started.current = true;
    trackEvent("form_start", { project_type: lead.project || "não selecionado" });
  };

  const message = () => {
    const campaign = getCampaignContext();
    return [
      "Olá, AR1! Vim pelo site e quero falar sobre uma proposta.", `Nome: ${lead.name}`, lead.role ? `Cargo: ${lead.role}` : "", `WhatsApp: ${lead.phone}`, lead.email ? `E-mail: ${lead.email}` : "", `Empresa: ${lead.company}`, `Principal interesse: ${lead.project}`, lead.brief ? `O que precisa acontecer: ${lead.brief}` : "", lead.date ? `Data prevista: ${lead.date}` : "", campaign.source ? `UTM source: ${campaign.source}` : "", campaign.medium ? `UTM medium: ${campaign.medium}` : "", campaign.campaign ? `UTM campaign: ${campaign.campaign}` : ""].filter(Boolean).join("\n");
  };
  function submit(event: FormEvent) {
    event.preventDefault();
    trackEvent("lead_form_submit", { page: window.location.pathname, interest: lead.project, channel: "email" });
    window.location.href = `mailto:${EMAIL}?subject=${encodeURIComponent(`Solicitação de proposta ${SITE_NAME}`)}&body=${encodeURIComponent(message())}`;
    setStatus(`Conclua o envio no aplicativo de e-mail. Se ele não abrir, escreva para ${EMAIL}.`);
  }
  function sendWhatsapp() { trackEvent("whatsapp_click", { location: "form", page: window.location.pathname, interest: lead.project }); trackEvent("lead_form_submit", { page: window.location.pathname, interest: lead.project, channel: "whatsapp" }); window.open(whatsappMessageLink(message()), "_blank", "noopener,noreferrer"); }

  return (
    <form className="lead-form" onSubmit={submit} onFocus={registerStart} aria-label="Solicitação de proposta" aria-describedby="form-status form-privacy">
      <p className="form-heading full"><span>Briefing inicial</span><strong>Conte o essencial. A AR1 organiza o próximo passo.</strong></p>
      <div className="field"><label htmlFor="name">Nome <span>obrigatório</span></label><input id="name" autoComplete="name" maxLength={80} required value={lead.name} onChange={(event) => update("name", event.target.value)} /></div>
      <div className="field"><label htmlFor="role">Cargo ou função</label><input id="role" autoComplete="organization-title" maxLength={100} value={lead.role} onChange={(event) => update("role", event.target.value)} /></div>
      <div className="field"><label htmlFor="phone">WhatsApp <span>obrigatório</span></label><input id="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={24} placeholder="(00) 00000-0000" required value={lead.phone} onChange={(event) => update("phone", event.target.value)} /></div>
      <div className="field"><label htmlFor="email">E-mail</label><input id="email" type="email" inputMode="email" autoComplete="email" maxLength={160} placeholder="voce@empresa.com.br" value={lead.email} onChange={(event) => update("email", event.target.value)} /></div>
      <div className="field"><label htmlFor="company">Empresa, organização ou projeto <span>obrigatório</span></label><input id="company" autoComplete="organization" maxLength={160} required value={lead.company} onChange={(event) => update("company", event.target.value)} /></div>
      <div className="field"><label htmlFor="project">Principal interesse <span>obrigatório</span></label><select id="project" required value={lead.project} onChange={(event) => update("project", event.target.value)}><option value="">Selecione</option>{projectOptions.map((project) => <option key={project} value={project}>{project}</option>)}</select></div>
      <div className="field full"><label htmlFor="brief">O que precisa acontecer?</label><textarea id="brief" rows={4} maxLength={1000} value={lead.brief} onChange={(event) => update("brief", event.target.value)} placeholder="Conte o objetivo, o público e a necessidade principal." /></div>
      <div className="field full"><label htmlFor="date">Data prevista, se houver</label><input id="date" type="date" value={lead.date} onChange={(event) => update("date", event.target.value)} /></div>
      <input type="hidden" name="utm_source" value={getCampaignContext().source ?? ""} /><input type="hidden" name="utm_medium" value={getCampaignContext().medium ?? ""} /><input type="hidden" name="utm_campaign" value={getCampaignContext().campaign ?? ""} />
      <div className="form-actions full"><button className="button primary" type="submit">Solicitar proposta</button><button className="button ghost" type="button" onClick={sendWhatsapp}>Enviar pelo WhatsApp</button></div>
      <p id="form-status" className="form-note full" role="status" aria-live="polite">{status || "A equipe responde pelo canal que fizer mais sentido para o projeto."}</p>
      <p id="form-privacy" className="form-privacy full">Ao enviar, você autoriza a {SITE_NAME} a entrar em contato pelos dados informados.</p>
    </form>
  );
}

function ContactSection({ defaultProject = "", title = "Conte o que precisa acontecer." }: { defaultProject?: string; title?: string }) {
  const selectedProject = new URLSearchParams(window.location.search).get("projeto") || (window.location.pathname === "/podcast" ? pageInterest("/podcast") : defaultProject);
  return (
    <section id="contato" className="contact section-dark">
      <div className="contact-visual"><img src="/media/glow-horizontal.webp" alt="Luz no horizonte" loading="lazy" /><div className="image-overlay" /></div>
      <div className="contact-layout page-shell">
        <Reveal className="contact-copy"><p className="eyebrow">Próximo passo</p><h2>{title}</h2><p>Responde uma pessoa da equipe, não um robô. Se preferir, chame direto no WhatsApp.</p><a className="button primary contact-whatsapp" href={whatsappLink(selectedProject || "a melhor solução")} onClick={() => trackEvent("whatsapp_click", { location: "contact", page: window.location.pathname, interest: selectedProject || pageInterest(window.location.pathname) })}>Chamar no WhatsApp · {WHATSAPP_DISPLAY}</a><ul className="contact-points"><li><span>01</span>Resposta humana e contextual</li><li><span>02</span>Escopo antes do orçamento</li><li><span>03</span>Agenda e viabilidade confirmadas</li></ul></Reveal>
        <ContactForm defaultProject={selectedProject} />
      </div>
    </section>
  );
}

type BreadcrumbItem = { label: string; href?: string };

function Breadcrumbs({ items }: { items: readonly BreadcrumbItem[] }) {
  return (
    <nav className="breadcrumbs" aria-label="Trilha de navegação">
      <a href="/">Início</a>
      {items.map((item) => <span key={`${item.href ?? "current"}-${item.label}`}>{item.href ? <a href={item.href}>{item.label}</a> : <b aria-current="page">{item.label}</b>}</span>)}
    </nav>
  );
}

function PageHero({ eyebrow, title, summary, image, mobileImage, secondaryCta, secondaryHref, breadcrumbs = [{ label: eyebrow }] }: { eyebrow: string; title: string; summary: string; image: string; mobileImage?: string; secondaryCta?: string; secondaryHref?: string; breadcrumbs?: readonly BreadcrumbItem[] }) {
  return (
    <section className="page-hero">
      <picture className="page-hero-media">
        {mobileImage ? <source media="(max-width: 700px)" srcSet={mobileImage} /> : null}
        <img src={image} alt="" fetchPriority="high" />
      </picture>
      <div className="image-overlay" />
      <div className="page-hero-copy page-shell"><Breadcrumbs items={breadcrumbs} /><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{summary}</p><div className="hero-actions"><a className="button primary" href="#contato" onClick={() => trackEvent("cta_primary_click", { page: window.location.pathname })}>Solicitar proposta</a>{secondaryCta && secondaryHref ? <a className="button ghost" href={secondaryHref}>{secondaryCta}</a> : null}</div></div>
    </section>
  );
}

function FamilyCards({ expanded = false }: { expanded?: boolean }) {
  return (
    <div className={`family-grid ${expanded ? "expanded" : ""}`}>
      {solutionFamilies.map((family) => (
        <Reveal className="family-card" key={family.key}>
          <div className="family-index"><span>{family.number}</span><small>{family.eyebrow}</small></div>
          {expanded && <img src={family.image} alt="" loading="lazy" />}
          <h3>{family.title}</h3><p>{family.body}</p>
          <ul>{family.items.map((item) => <li key={item}>{item}</li>)}</ul>
          <b>{family.status}</b>
        </Reveal>
      ))}
    </div>
  );
}

function FlagshipGrid() {
  return (
    <div className="flagship-grid">
      {flagshipOffers.map((offer) => (
        <Reveal className="flagship-card" key={offer.title}><a href={offer.href} onClick={() => trackEvent("service_view", { service_name: offer.title, cta_location: "flagship_card" })}><img src={offer.image} alt="" loading="lazy" /><div className="image-overlay" /><div className="flagship-copy"><span>{offer.tag}</span><h3>{offer.title}</h3><p>{offer.body}</p><b>Conhecer oferta</b></div></a></Reveal>
      ))}
    </div>
  );
}

function VisualCarousel() {
  const [active, setActive] = useState(0);
  const story = visualStories[active];
  const selectStory = (index: number, interaction: "seta" | "miniatura") => {
    setActive(index);
    trackEvent("carousel_select", { carousel_item: visualStories[index].label, interaction });
  };
  const change = (direction: number) => selectStory((active + direction + visualStories.length) % visualStories.length, "seta");

  return (
    <section className="visual-chapter section-dark" aria-labelledby="visual-chapter-title">
      <div className="page-shell">
        <Reveal className="section-heading compact">
          <div><p className="eyebrow">Imagens para entender a operação</p><h2 id="visual-chapter-title">Mais espaço para ver. Mais contexto para decidir.</h2></div>
          <p>Uma leitura visual das frentes que a AR1 organiza — da produção em campo à implantação de estúdios.</p>
        </Reveal>
        <div className="visual-carousel" role="region" aria-roledescription="carrossel" aria-label="Capacidades visuais da AR1 Films">
          <div id="visual-story-panel" className="visual-carousel-stage" role="tabpanel" tabIndex={0} aria-label={story.label}>
            {visualStories.map((item, index) => <img className={index === active ? "active" : ""} key={item.image} src={item.image} alt={index === active ? item.alt : ""} loading={index === 0 ? "eager" : "lazy"} aria-hidden={index !== active} />)}
            <div className="visual-carousel-scrim" />
            <div className="visual-carousel-copy" aria-live="polite">
              <span>{String(active + 1).padStart(2, "0")} / {String(visualStories.length).padStart(2, "0")}</span>
              <p className="eyebrow">{story.label}</p>
              <h3>{story.title}</h3>
              <p>{story.body}</p>
              <a className="button ghost" href={story.href} onClick={() => trackEvent("service_view", { service_name: story.label, cta_location: "visual_carousel" })}>{story.cta}</a>
            </div>
            <div className="visual-carousel-controls">
              <button type="button" onClick={() => change(-1)} aria-label="Imagem anterior"><span aria-hidden="true">←</span></button>
              <button type="button" onClick={() => change(1)} aria-label="Próxima imagem"><span aria-hidden="true">→</span></button>
            </div>
          </div>
          <div className="visual-carousel-nav">
            <div className="visual-carousel-nav-copy"><span>Explore as frentes</span><p>Selecione uma cena para ver a imagem e conhecer os detalhes.</p></div>
            <div className="visual-carousel-thumbs" role="tablist" aria-label="Selecionar uma frente da AR1 Films">
              {visualStories.map((item, index) => (
                <button className={index === active ? "active" : ""} type="button" role="tab" key={item.image} onClick={() => selectStory(index, "miniatura")} aria-label={`Ver detalhes de ${item.label}`} aria-selected={index === active} aria-controls="visual-story-panel">
                  <span className="visual-thumb-media"><img src={item.image} alt="" loading="lazy" /><b>{String(index + 1).padStart(2, "0")}</b></span>
                  <span className="visual-thumb-copy"><strong>{item.label}</strong><small>{index === active ? "Em exibição" : "Ver detalhes"}</small></span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="visual-disclaimer">Imagens de direção visual. Cases de clientes, marcas e resultados só serão identificados após comprovação e autorização de uso.</p>
      </div>
    </section>
  );
}

function Showreel() {
  return <VisualCarousel />;
}

function ProofStrip() {
  const entries = [[proof.episodios.display, proof.episodios.label], [proof.shows, "shows e DVDs gravados"], [proof.leiloes, "leilões transmitidos"], [proof.estudios, "estúdios implantados"], [proof.horasAoVivo, "horas de transmissão ao vivo"]].filter(([value]) => value !== "TODO");
  if (entries.length === 0) return null;
  return <section className="proof-strip section-light"><div className="page-shell"><Reveal><p className="eyebrow">Projetos realizados</p><h2>Só publicamos o que fizemos.</h2><p>Cada número e cada imagem deste site vêm de projetos entregues, com autorização de quem contratou.</p></Reveal><div className="fact-grid light">{entries.map(([value, label]) => <div className="fact-card" key={label}><strong>{value}</strong><span>{label}</span></div>)}</div></div></section>;
}

export function EvidenceCases() {
  return (
    <section id="cases" className="evidence-section section-light">
      <div className="page-shell">
        <Reveal className="section-heading compact">
          <div><p className="eyebrow">Projetos e formatos</p><h2>Capacidade, método e contexto antes da promessa.</h2></div>
          <p>A AR1 diferencia capacidade informada, oferta estruturada e método consultivo. Cases de clientes e resultados entram somente com evidência e autorização.</p>
        </Reveal>
        <div className="evidence-grid">
          {evidenceCases.map((item) => (
            <Reveal className="evidence-card" key={item.label}>
              <div className="evidence-media"><img src={item.image} alt={item.alt} loading="lazy" /><span>{item.status}</span></div>
              <div className="evidence-copy"><p className="eyebrow">{item.label}</p><h3>{item.title}</h3><p>{item.body}</p><strong>{item.proof}</strong><a className="text-link" href={item.href}>{item.cta}</a></div>
            </Reveal>
          ))}
        </div>
        <p className="evidence-disclaimer">Imagens de direção visual. Elas representam contexto e linguagem; não são apresentadas como registro de clientes ou comprovação de resultados.</p>
      </div>
    </section>
  );
}

function PodcastConsultingFeature() {
  return (
    <section className="consulting-feature section-dark">
      <div className="page-shell media-split">
        <Reveal className="consulting-feature-media"><img src="/media/consultoria-hero-estudio-v1.webp" alt="Estúdio de podcast equipado para produção profissional" loading="lazy" /><img src="/media/consultoria-bastidores-estudio-v1.webp" alt="Bastidores de um estúdio de videocast em operação" loading="lazy" /><span>Diagnóstico · projeto · implantação · ativação</span></Reveal>
        <Reveal className="consulting-feature-copy"><p className="eyebrow">Consultoria de podcast e estúdios</p><h2>O equipamento é parte do sistema. Não é o ponto de partida.</h2><p>A AR1 estrutura objetivo, formatos, espaço, acústica, cenografia, áudio, vídeo, iluminação, software e fluxo para que o estúdio consiga operar depois da inauguração.</p><ul><li>Para projetos do zero ou estruturas existentes</li><li>Projeto técnico alinhado ao uso e à equipe</li><li>Implantação, testes, treinamento e evolução</li></ul><a className="button primary" href="/consultoria-podcast">Conhecer a jornada consultiva</a></Reveal>
      </div>
    </section>
  );
}

function IntentRouter() {
  return (
    <section id="objetivos" className="intent-router section-light" aria-labelledby="intent-title">
      <div className="page-shell">
        <Reveal className="section-heading compact"><div><p className="eyebrow">Comece pelo objetivo</p><h2 id="intent-title">O que precisa acontecer agora?</h2></div><p>Escolha o desafio mais próximo. A próxima página organiza capacidade, processo e proposta sem exigir que você conheça os nomes técnicos.</p></Reveal>
        <div className="intent-grid">
          {intentRoutes.map((item) => (
            <Reveal className="intent-card" key={item.number}>
              <a href={item.href} onClick={() => trackEvent("intent_select", { intent_name: item.prompt })}>
                <span>{item.number}</span><h3>{item.prompt}</h3><p>{item.body}</p><b>{item.destination}</b>
              </a>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

type RelatedJourney = { label: string; title: string; body: string; href: string };

function RelatedJourneys({ items, title = "Continue pela necessidade do projeto." }: { items: readonly RelatedJourney[]; title?: string }) {
  return (
    <section className="related-section section-dark" aria-labelledby="related-title">
      <div className="page-shell">
        <Reveal className="section-heading compact"><div><p className="eyebrow">Próximos caminhos</p><h2 id="related-title">{title}</h2></div><p>As frentes podem ser contratadas separadamente ou combinadas conforme objetivo, local, equipe, prazo e complexidade.</p></Reveal>
        <div className="related-grid">
          {items.map((item, index) => <Reveal className="related-card" key={item.href}><a href={item.href} onClick={() => trackEvent("related_service_click", { service_name: item.title })}><span>{String(index + 1).padStart(2, "0")} · {item.label}</span><h3>{item.title}</h3><p>{item.body}</p><b>Conhecer este caminho</b></a></Reveal>)}
        </div>
      </div>
    </section>
  );
}

function ComplementaryCapabilities() {
  const capabilities = legacyServiceDetails.filter((item) => item.slug !== "consultoria-implantacao-estudios-podcast");
  return (
    <section className="capability-index-section section-light" aria-labelledby="capability-index-title">
      <div className="page-shell split">
        <Reveal><p className="eyebrow">Capacidades complementares</p><h2 id="capability-index-title">Entre a oferta principal e a operação sob medida.</h2><p className="section-intro dark">Estas frentes permanecem conectadas à arquitetura AR1. Elas ajudam a detalhar necessidades específicas sem aumentar o menu principal.</p></Reveal>
        <div className="capability-index">
          {capabilities.map((item, index) => <Reveal className="capability-index-row" key={item.slug}><a href={`/servicos/${item.slug}`} onClick={() => trackEvent("service_view", { service_name: item.title, cta_location: "capability_index" })}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{item.title}</strong><small>{item.eyebrow}</small></div><b aria-hidden="true">→</b></a></Reveal>)}
        </div>
      </div>
    </section>
  );
}

function Home() {
  usePageMeta("AR1 Films | Produção audiovisual, locação e transmissões em Goiânia", "Locação de grande escala no Haras SOBI (+20 cenários, área coberta para 4 mil pessoas), transmissão de leilões, estúdios de podcast e filmes de legado. Goiânia - GO.");
  const queryProject = new URLSearchParams(window.location.search).get("projeto") ?? "";

  return (
    <><Header /><main id="conteudo">
      <section className="home-hero">
        <picture className="home-hero-media">
          <source media="(max-width: 700px)" srcSet="/media/ar1-films-fachada-2026-v1-mobile.webp" />
          <img src="/media/ar1-films-fachada-2026-v1.webp" alt="Fachada iluminada da AR1 Films" fetchPriority="high" />
        </picture>
        <div className="image-overlay" />
        <div className="home-hero-copy page-shell"><p className="eyebrow">Produção audiovisual · Goiânia - GO</p><h1>Produção de conteúdo,<br /><span>podcast, transmissão<br />e cenários únicos.</span></h1><p>De Goiânia para o Brasil: uma equipe para gravar, transmitir e entregar projetos que pedem estrutura.</p><div className="hero-actions"><a className="button primary" href="#contato" onClick={() => trackEvent("cta_primary_click", { page: "/" })}>Solicitar proposta</a><a className="button ghost" href="/haras-sobi">Ver o Haras SOBI</a></div><p className="hero-proof">+20 cenários · 4 mil pessoas · Pista de laço</p></div>
        <a className="hero-haras-link" href="/haras-sobi" onClick={() => trackEvent("service_view", { service_name: "Haras SOBI", cta_location: "home_hero" })}><span>Oferta principal</span><strong>Conheça o Haras SOBI</strong><b>+20 cenários · até 4 mil pessoas</b></a>
      </section>

      <section className="signal-band" aria-label="Principais capacidades"><span>Shows, DVDs e campanhas</span><span>Podcast e consultoria</span><span>Transmissões ao vivo</span><span>Haras SOBI</span></section>

      <IntentRouter />

      <Showreel />

      <section className="haras-feature section-dark">
        <picture className="haras-feature-media" aria-hidden="true">
          <source media="(max-width: 700px)" srcSet="/media/haras-vista-aerea-2026-v1-mobile.webp" />
          <img src="/media/haras-vista-aerea-2026-v1.webp" alt="" loading="lazy" decoding="async" />
        </picture>
        <div className="page-shell"><div className="section-heading"><Reveal><p className="eyebrow">Haras SOBI · GO-010, sentido Nerópolis</p><h2>Um dos maiores espaços de produção de conteúdo do Brasil fica na saída de Goiânia.</h2></Reveal><Reveal><p>Mais de 20 cenários — pista de laço, bosque, lago, palcos, salão e grande área coberta — em um só endereço. Você chega com a ideia e sai com o projeto gravado.</p><a className="button primary" href="/haras-sobi">Explorar o Haras SOBI</a></Reveal></div><div className="fact-grid">{harasFacts.map((fact) => <Reveal className="fact-card" key={fact.value}><strong>{fact.value}</strong><span>{fact.label}</span></Reveal>)}</div></div>
      </section>

      <section className="flagships section-dark"><div className="page-shell"><Reveal><p className="eyebrow">Ofertas com nome e entrega definida</p><h2>Cinco formas de trabalhar com a AR1.</h2></Reveal><FlagshipGrid /><p className="section-intro">Precisa de mais de uma frente? Transmissão ao vivo, fotografia e vídeo, podcast itinerante e produção externa entram em qualquer projeto. <a className="text-link" href="/solucoes">Ver todas as soluções</a></p></div></section>

      <section className="method-preview section-light"><div className="page-shell split"><Reveal><p className="eyebrow">Método AR1</p><h2>Clareza antes da câmera.</h2><p className="section-intro dark">Cada projeto começa pela decisão, pelo público e pelo uso. Equipamento, equipe e formato entram depois.</p><a className="text-link" href="/metodo">Conhecer o método</a></Reveal><div className="method-list">{methodSteps.map((step) => <Reveal className="method-row" key={step.number}><span>{step.number}</span><div><h3>{step.title}</h3><p>{step.body}</p></div></Reveal>)}</div></div></section>

      <ProofStrip />

      <section className="about-preview section-light"><div className="page-shell media-split"><img src="/media/camera-auction-vertical.webp" alt="Operação audiovisual em evento" loading="lazy" /><Reveal><p className="eyebrow">Nascemos no campo</p><h2>Aprendemos a produzir onde não dá para errar.</h2><p>A AR1 nasceu em Goiás, dentro do agronegócio: leilões ao vivo, eventos em fazenda, transmissões sem segunda chance. Hoje levamos essa disciplina para empresas, instituições, marcas e projetos culturais — do estúdio de podcast ao show para 4 mil pessoas.</p><a className="text-link" href="/sobre">Conhecer a AR1</a></Reveal></div></section>

      <section className="faq section-light"><div className="page-shell split"><Reveal><p className="eyebrow">Perguntas frequentes</p><h2>Antes da primeira conversa.</h2></Reveal><div className="faq-list">{faq.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></div></section>
      <ContactSection defaultProject={queryProject} />
    </main><Footer /></>
  );
}

function SolutionsPage() {
  usePageMeta("Soluções | AR1 Films", "Produzimos para você, montamos a estrutura para a sua equipe produzir, ou os dois.");
  return <><Header /><main id="conteudo">
    <PageHero eyebrow="Soluções AR1" title="Produzimos para você, montamos a estrutura para a sua equipe produzir, ou os dois." summary="Escolha pelo problema, não pelo equipamento. Aqui estão as ofertas e as capacidades que entram em cada projeto." image="/media/edit-suite.webp" secondaryHref="/haras-sobi" secondaryCta="Ver o Haras SOBI" breadcrumbs={[{ label: "Soluções" }]} />
    <section id="familias" className="page-section section-light"><div className="page-shell"><Reveal><p className="eyebrow">Arquitetura comercial</p><h2>Escolha pelo desafio, não pelo equipamento.</h2></Reveal><FamilyCards expanded /></div></section>
    <section className="decision-section section-dark"><div className="page-shell"><Reveal><p className="eyebrow">Como decidir</p><h2>Três perguntas organizam o próximo passo.</h2></Reveal><div className="decision-grid"><article><span>01</span><h3>Você precisa de cadência?</h3><p>Operação de Conteúdo organiza especialistas, pauta, produção e entregas recorrentes.</p></article><article><span>02</span><h3>Você precisa de autonomia?</h3><p>Construir Capacidade avalia, projeta e ativa uma estrutura própria para sua organização.</p></article><article><span>03</span><h3>Você precisa realizar um marco?</h3><p>Projetos Especiais reúne transmissão, evento, filme, locação e produção sob medida.</p></article></div></div></section>
    <section className="page-section section-light"><div className="page-shell"><Reveal><p className="eyebrow">Ofertas principais</p><h2>Produtos com identidade própria.</h2></Reveal><FlagshipGrid /></div></section>
    <PodcastConsultingFeature />
    <ComplementaryCapabilities />
    <ContactSection title="Vamos identificar a solução com maior aderência." />
  </main><Footer /></>;
}

function PodcastGallery() {
  const [category, setCategory] = useState("todos");
  const [selected, setSelected] = useState<number | null>(null);
  if (podcastGallery.length === 0) return null;
  const items = category === "todos" ? podcastGallery : podcastGallery.filter((item) => item.category === category);
  const categories = ["todos", ...Array.from(new Set(podcastGallery.map((item) => item.category)))];
  return <section id="galeria" className="page-section section-light"><div className="page-shell"><Reveal><p className="eyebrow">Quem já sentou na nossa mesa</p><h2>Influenciadores, artistas, políticos, personalidades e quem está começando.</h2><p>Mais de 4 mil episódios. Alguns nomes você conhece. Outros começaram aqui.</p></Reveal><div className="gallery-filters">{categories.map((item) => <button type="button" key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item === "todos" ? "Todos" : item}</button>)}</div><div className="podcast-gallery">{items.map((item, index) => <button type="button" key={item.src} onClick={() => setSelected(index)}><img src={item.src} alt={item.alt} loading="lazy" /><span>{[item.guest, item.program].filter(Boolean).join(" · ")}</span></button>)}</div>{selected !== null && items[selected] ? <div className="gallery-lightbox" role="dialog" aria-modal="true" aria-label="Foto ampliada" onClick={() => setSelected(null)}><img src={items[selected].src} alt={items[selected].alt} /></div> : null}</div></section>;
}

function PodcastPage() {
  usePageMeta("Gravação de podcast e transmissão ao vivo | AR1 Films · Goiânia e todo o Brasil", "Mais de 4 mil episódios gravados com influenciadores, artistas, políticos e criadores. Gravado e editado até a postagem ou ao vivo. Estúdio montado em qualquer lugar do Brasil.");
  const paths = [["Gravado e editado", "Você grava. Nós sincronizamos o áudio, colorimos a imagem, editamos, cortamos os melhores momentos, renderizamos e deixamos pronto para postar.", ["Sincronização de áudio", "Colorização", "Edição completa", "Cortes para redes", "Renderização", "Postagem opcional"]], ["Ao vivo", "Transmissão dirigida em tempo real, com troca de câmeras, inserção de telas e gravação simultânea para reaproveitar depois.", ["Direção ao vivo", "Multicâmera", "Inserção de telas e vinhetas", "Gravação simultânea", "Cortes depois da live"]]] as const;
  const audience = [["Quem está começando", "Você chega com o tema. A gente cuida de câmera, luz, som e edição, e orienta o formato."], ["Criadores e influenciadores", "Cadência e qualidade para manter a audiência: gravação em série, cortes para redes e entrega no prazo."], ["Artistas, políticos e personalidades", "Agenda apertada, imagem cuidada: gravação eficiente, direção de entrevista e material aprovado antes de sair."], ["Empresas e instituições", "Podcast corporativo, conversas com especialistas e conteúdo para clientes, com equipe e rotina que cabem na empresa."]] as const;
  const steps = [["01", "Briefing", "Tema, formato, convidados e onde publicar."], ["02", "Agenda", "Data no estúdio, no Haras SOBI ou no seu evento."], ["03", "Gravação ou live", "Equipe, câmeras, luz e som com direção."], ["04", "Pós-produção", "Sincronização, colorização, edição, cortes e renderização."], ["05", "Entrega e postagem", "Arquivo final e, se quiser, publicação nas suas plataformas."]] as const;
  return <><Header /><main id="conteudo"><PageHero eyebrow="Podcast · gravação, edição e transmissão ao vivo · Goiânia e todo o Brasil" title="Mais de 4 mil episódios gravados. O próximo pode ser o seu." summary="Influenciadores, artistas, políticos, personalidades e gente que está começando gravam com a AR1. Você escolhe: grava e a gente edita até a postagem, ou vai ao vivo. No nosso estúdio, no Haras SOBI ou em qualquer lugar do Brasil." image="/media/podcast-entrevista-v1.webp" secondaryHref="#galeria" secondaryCta="Ver quem já gravou" breadcrumbs={[{ label: "Podcast" }]} /><section className="signal-band"><span>+4 mil episódios</span><span>Gravado ou ao vivo</span><span>Estúdio em qualquer lugar do Brasil</span><span>Edição até a postagem</span></section><section className="page-section section-light"><div className="page-shell"><Reveal><p className="eyebrow">Como você quer publicar</p><h2>Gravado ou ao vivo. Você escolhe, a gente entrega.</h2></Reveal><div className="value-grid">{paths.map(([title, body, items], index) => <Reveal className="value-card" key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{body}</p><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></Reveal>)}</div><p className="section-intro dark">Não sabe qual? Comece pelo gravado. Dá para migrar para o ao vivo quando a audiência pedir.</p></div></section><PodcastGallery /><section className="page-section section-dark"><div className="page-shell"><Reveal><p className="eyebrow">Para quem é</p><h2>Do primeiro episódio ao programa com audiência.</h2></Reveal><div className="consulting-fit-grid">{audience.map(([title, body], index) => <Reveal className="consulting-fit-card" key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{body}</p></Reveal>)}</div></div></section><section id="itinerante" className="page-section section-light"><div className="page-shell split"><Reveal><p className="eyebrow">Podcast itinerante · todo o Brasil</p><h2>Montamos o estúdio dentro da sua feira, congresso ou evento.</h2><p>Cenário, luz, áudio, câmeras e equipe chegam onde o público está. Grave entrevistas com palestrantes, patrocinadores e visitantes durante o evento.</p><a className="button primary" href="#contato">Solicitar proposta</a></Reveal><Reveal className="large-copy"><ul><li>Montagem e desmontagem no local</li><li>Cenário com a identidade do evento ou patrocinador</li><li>Gravação em série com fila de convidados</li><li>Cortes rápidos para as redes do evento</li></ul></Reveal></div></section><section id="ao-vivo" className="page-section section-dark"><div className="page-shell split"><Reveal><p className="eyebrow">Transmissão ao vivo · congressos, palestras e eventos</p><h2>Do palco para quem não pôde estar lá.</h2><p>Transmitimos congressos, palestras, eventos corporativos, culturais e institucionais em Goiânia e em todo o Brasil.</p><a className="button primary" href="#contato">Solicitar proposta</a></Reveal><Reveal className="large-copy"><ul><li>Multicâmera com direção ao vivo</li><li>Inserção de slides, telões e vinhetas</li><li>Áudio integrado à mesa do evento</li><li>Planejamento técnico de sinal e conexão</li><li>Gravação completa para reaproveitar</li></ul><a className="text-link" href="/leilao-360">Leilão ao vivo? Esse tem página própria: Leilão 360.</a></Reveal></div></section><section className="page-section section-light"><div className="page-shell"><Reveal><p className="eyebrow">Como funciona</p><h2>Do convite ao episódio publicado.</h2></Reveal><ol className="consulting-steps">{steps.map(([number, title, body]) => <li className="consulting-step" key={number}><span>{number}</span><div><h3>{title}</h3><p>{body}</p></div></li>)}</ol></div></section><RelatedJourneys items={relatedJourneys.podcast} title="Continue pelo formato que o projeto precisa." /><ContactSection defaultProject="Gravação de podcast (gravado ou ao vivo)" title="Vamos gravar o seu próximo episódio?" /></main><Footer /></>;
}

function ConsultingPage() {
  usePageMeta("Consultoria de estúdio de podcast | Projeto, implantação e treinamento", "Do diagnóstico ao treinamento da equipe: seu estúdio nasce funcionando. AR1 Films, Goiânia - GO.");
  return (
    <><Header /><main id="conteudo" className="consulting-page">
      <PageHero eyebrow="Consultoria de estúdio · projeto e implantação" title="Seu estúdio precisa funcionar depois da inauguração. Não só na foto." summary="Antes de comprar equipamento, definimos para que o estúdio serve, quem opera e com que rotina. Depois projetamos, implantamos, testamos e treinamos a sua equipe." image="/media/consultoria-hero-estudio-v1.webp" secondaryHref="#diagnostico" secondaryCta="Ver as 5 etapas" breadcrumbs={[{ label: "Soluções", href: "/solucoes" }, { label: "Consultoria de estúdio" }]} />

      <section id="diagnostico" className="consulting-intro section-light"><div className="page-shell split"><Reveal><p className="eyebrow">Decisão antes da compra</p><h2>O investimento certo começa pelo uso.</h2></Reveal><Reveal className="large-copy"><p>Quem vai gravar? Com que frequência? Para quais formatos? Quem opera, edita, publica e mantém? Essas respostas definem o projeto antes da lista de equipamentos.</p><strong>Um estúdio funcional conecta estrutura, pessoas e rotina.</strong></Reveal></div></section>

      <section className="consulting-visual section-dark"><div className="page-shell"><Reveal className="section-heading compact"><div><p className="eyebrow">Visão do sistema</p><h2>Da sala vazia ao primeiro ciclo de produção.</h2></div><p>O projeto considera cada ponto de contato da operação: preparação, gravação, monitoramento, pós-produção, armazenamento e publicação.</p></Reveal><div className="consulting-photo-grid"><Reveal className="consulting-photo photo-main"><img src="/media/consultoria-estudio-sobi-v1.webp" alt="Estúdio de podcast com câmeras, microfones e iluminação profissional" loading="lazy" /><span>Estrutura e integração</span></Reveal><Reveal className="consulting-photo"><img src="/media/consultoria-bastidores-estudio-v1.webp" alt="Bastidores de um estúdio de videocast em operação" loading="lazy" /><span>Fluxo e direção</span></Reveal><Reveal className="consulting-photo"><img src="/media/consultoria-equipamento-camera-v1.webp" alt="Câmera e lentes para produção profissional" loading="lazy" /><span>Captação e operação</span></Reveal></div><p className="visual-disclaimer">Imagens de direção visual. A solução final é desenhada a partir do espaço, do uso e das condições reais do projeto.</p></div></section>

      <section className="consulting-fit section-light"><div className="page-shell"><Reveal><p className="eyebrow">Quando a consultoria faz sentido</p><h2>Quatro pontos de partida. Um diagnóstico próprio.</h2></Reveal><div className="consulting-fit-grid">{podcastConsulting.fits.map(([title, body], index) => <Reveal className="consulting-fit-card" key={title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{title}</h3><p>{body}</p></Reveal>)}</div></div></section>

      <section className="consulting-journey section-dark"><div className="page-shell"><Reveal className="section-heading compact"><div><p className="eyebrow">Jornada consultiva</p><h2>Cinco etapas para reduzir improviso.</h2></div><p>Cada fase termina com decisões claras. O escopo pode parar no projeto ou seguir até implantação, treinamento e acompanhamento.</p></Reveal><ol className="consulting-steps">{podcastConsulting.steps.map(([number, title, body]) => <li className="consulting-step" key={number}><span>{number}</span><div><h3>{title}</h3><p>{body}</p></div></li>)}</ol></div></section>

      <section className="consulting-deliverables section-light"><div className="page-shell split"><Reveal><p className="eyebrow">Entregáveis possíveis</p><h2>O projeto deixa decisões documentadas.</h2><p className="section-intro dark">A proposta define quais entregáveis entram, responsáveis, limites, cronograma e critérios de aceite.</p></Reveal><div className="deliverable-list">{podcastConsulting.deliverables.map((item, index) => <Reveal className="deliverable-row" key={item}><span>{String(index + 1).padStart(2, "0")}</span><p>{item}</p></Reveal>)}</div></div></section>

      <section className="consulting-decisions section-dark"><div className="page-shell"><Reveal><p className="eyebrow">Três decisões críticas</p><h2>O projeto deve caber na rotina.</h2></Reveal><div className="consulting-decision-grid">{podcastConsulting.decisions.map(([title, body], index) => <article key={title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{title}</h3><p>{body}</p></article>)}</div></div></section>

      <section className="consulting-faq section-light"><div className="page-shell split"><Reveal><p className="eyebrow">Perguntas sobre a consultoria</p><h2>Antes do diagnóstico.</h2></Reveal><div className="faq-list">{podcastConsulting.faq.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></div></section>
      <RelatedJourneys items={relatedJourneys.consulting} title="Depois do estúdio, a operação precisa ganhar uso." />
      <ContactSection defaultProject="Consultoria e implantação de estúdio de podcast" title="Vamos avaliar seu estúdio antes de definir a estrutura." />
    </main><Footer /></>
  );
}

function MethodPage() {
  usePageMeta("Método AR1 | Produção séria começa antes da gravação", "Entender, desenhar, produzir e melhorar. Você aprova o escopo antes de gastar.");
  return <><Header /><main id="conteudo"><PageHero eyebrow="Método AR1" title="Produção séria começa antes da gravação." summary="Quatro etapas, nenhum atalho escondido: entender, desenhar, produzir e melhorar. Você aprova o escopo antes de gastar." image="/media/camera-auction.webp" secondaryHref="/solucoes" secondaryCta="Ver soluções" breadcrumbs={[{ label: "Método" }]} /><section id="etapas" className="page-section section-light"><div className="page-shell"><Reveal><p className="eyebrow">Do diagnóstico à evolução</p><h2>Quatro etapas. Nenhum atalho invisível.</h2></Reveal><div className="method-grid">{methodSteps.map((step) => <Reveal className="method-card" key={step.number}><span>{step.number}</span><h3>{step.title}</h3><p>{step.body}</p></Reveal>)}</div></div></section><section className="principles-section section-dark"><div className="page-shell split"><Reveal><p className="eyebrow">Princípios de decisão</p><h2>O que orienta cada projeto.</h2></Reveal><div className="principle-list">{principles.map(([title, body], index) => <Reveal className="principle-row" key={title}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{title}</h3><p>{body}</p></div></Reveal>)}</div></div></section><RelatedJourneys items={relatedJourneys.method} /><ContactSection /></main><Footer /></>;
}

function AboutPage() {
  usePageMeta("Sobre a AR1 Films | Goiânia - GO", "Nascemos no agro de Goiás e aprendemos a produzir onde não dá para errar.");
  return <><Header /><main id="conteudo"><PageHero eyebrow="Sobre a AR1 Films · Goiânia - GO" title="Aprendemos a produzir onde não dá para errar." summary="Nascemos em Goiás, dentro do agronegócio: leilões ao vivo, eventos em fazenda e transmissões sem segunda chance. Hoje levamos essa disciplina para empresas, instituições, marcas e projetos culturais, com o Haras SOBI como nossa casa de produção." image="/media/cattle-rays.webp" secondaryHref="/metodo" secondaryCta="Conhecer o método" breadcrumbs={[{ label: "Sobre" }]} /><section className="page-section section-light"><div className="page-shell split"><Reveal><p className="eyebrow">Nossa direção</p><h2>Do campo para uma atuação multissetorial.</h2></Reveal><Reveal className="large-copy"><p>A experiência no agronegócio formou repertório para lidar com território, evento, transmissão, relacionamento e histórias de patrimônio. Essa força sustenta uma atuação com empresas B2B, instituições, marcas e projetos culturais.</p><p>A empresa une produção, consultoria e estrutura, sempre com ofertas e responsabilidades claramente definidas.</p></Reveal></div></section><section className="about-visual section-dark"><div className="page-shell media-split reverse"><img src="/media/event-stage.webp" alt="Estrutura de palco e produção" loading="lazy" /><Reveal><p className="eyebrow">Uma marca, várias frentes</p><h2>Estratégia, estrutura e execução sob a mesma direção.</h2><p>A AR1 não cria uma submarca para cada serviço. Conteúdo recorrente, estúdios, transmissões, filmes e Haras SOBI pertencem à mesma proposta de valor: fazer a mídia funcionar dentro de um objetivo real.</p></Reveal></div></section><section className="page-section section-light"><div className="page-shell"><Reveal><p className="eyebrow">Compromissos</p><h2>Como queremos trabalhar.</h2></Reveal><div className="commitment-grid"><article><span>01</span><h3>Escopo claro</h3><p>Entregas, responsabilidades e limites definidos antes da execução.</p></article><article><span>02</span><h3>Estrutura adequada</h3><p>Recursos dimensionados pela necessidade, e não pela aparência.</p></article><article><span>03</span><h3>Presença que permanece</h3><p>Conteúdo organizado para continuar útil depois do momento de produção.</p></article></div></div></section><RelatedJourneys items={relatedJourneys.about} /><ContactSection /></main><Footer /></>;
}

function HarasPage() {
  usePageMeta("Haras SOBI | Locação para shows, DVDs, clipes e eventos em Goiânia", "Mais de 20 cenários, pista de laço e área coberta para 4 mil pessoas na GO-010, saída de Goiânia. Locação e produção pensadas juntas.");
  const gallery = [
    { image: "/media/haras-pista-e-cavalo-2026-v1.webp", small: "/media/haras-pista-e-cavalo-2026-v1-sm.webp", label: "Pista e identidade equestre", alt: "Cavalo e cavaleiro na pista do Haras SOBI" },
    { image: "/media/haras-show-noturno-2026-v1.webp", small: "/media/haras-show-noturno-2026-v1-sm.webp", label: "Shows e experiências ao vivo", alt: "Show noturno com palco e público no Haras SOBI" },
    { image: "/media/haras-bosque-2026-v1.webp", small: "/media/haras-bosque-2026-v1-sm.webp", label: "Bosque e áreas de convivência", alt: "Bosque arborizado com paisagismo no Haras SOBI" },
    { image: "/media/haras-lago-2026-v1.webp", small: "/media/haras-lago-2026-v1-sm.webp", label: "Lago e paisagens naturais", alt: "Lago cercado por árvores e áreas verdes no Haras SOBI" },
    { image: "/media/haras-espaco-coberto-2026-v1.webp", small: "/media/haras-espaco-coberto-2026-v1-sm.webp", label: "Grande área coberta", alt: "Estrutura ampla e coberta do Haras SOBI" },
    { image: "/media/haras-palco-externo-2026-v1.webp", small: "/media/haras-palco-externo-2026-v1-sm.webp", label: "Palcos e ativações", alt: "Apresentação musical em palco externo no Haras SOBI" },
    { image: "/media/haras-salao-eventos-2026-v1.webp", small: "/media/haras-salao-eventos-2026-v1-sm.webp", label: "Salão para recepção e eventos", alt: "Salão coberto preparado com mesas no Haras SOBI" },
    { image: "/media/haras-lounge-coberto-2026-v1.webp", small: "/media/haras-lounge-coberto-2026-v1-sm.webp", label: "Ambientes cobertos e cenografia", alt: "Ambiente coberto com mobiliário de madeira no Haras SOBI" },
  ];
  return (
    <><Header /><main id="conteudo">
      <PageHero eyebrow="Haras SOBI · locação e produção · GO-010, sentido Nerópolis" title="Mais de 20 cenários. Área coberta para 4 mil pessoas. Um só endereço." summary="Show, DVD, clipe, campanha, filme ou evento: no Haras SOBI você grava em pista de laço, bosque, lago, palcos e salão sem trocar de locação. E pode contratar a produção junto." image="/media/haras-vista-aerea-2026-v1.webp" mobileImage="/media/haras-vista-aerea-2026-v1-mobile.webp" secondaryHref="#galeria" secondaryCta="Ver os cenários" breadcrumbs={[{ label: "Soluções", href: "/solucoes" }, { label: "Haras SOBI" }]} />
      <section className="haras-numbers section-light"><div className="page-shell"><Reveal><p className="eyebrow">Escala real</p><h2>Mais possibilidades. Menos deslocamentos.</h2></Reveal><div className="fact-grid light">{harasFacts.map((fact) => <Reveal className="fact-card" key={fact.value}><strong>{fact.value}</strong><span>{fact.label}</span></Reveal>)}</div></div></section>
      <section id="galeria" className="haras-gallery-section section-dark"><div className="page-shell"><Reveal className="section-heading compact"><div><p className="eyebrow">Uma locação, muitas linguagens</p><h2>Do íntimo ao monumental.</h2></div><p>Fotografias reais do Haras SOBI. O desenho do projeto define áreas, circulação, montagem, equipe, captação e operação. A disponibilidade é confirmada conforme agenda e avaliação técnica.</p></Reveal><div className="venue-gallery">{gallery.map((item, index) => <Reveal className={`venue-shot shot-${index + 1}`} key={item.label}><picture><source media="(max-width: 700px)" srcSet={item.small} /><img src={item.image} alt={item.alt} loading="lazy" decoding="async" /></picture><span>{String(index + 1).padStart(2, "0")} · {item.label}</span></Reveal>)}</div></div></section>
      <section className="applications-section section-light"><div className="page-shell"><Reveal><p className="eyebrow">O que pode acontecer aqui</p><h2>Uma plataforma para produção, evento e experiência.</h2></Reveal><div className="application-grid">{harasApplications.map(([title, body], index) => <Reveal className="application-card" key={title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{title}</h3><p>{body}</p></Reveal>)}</div></div></section>
      <section className="haras-operation section-dark"><div className="page-shell split"><Reveal><p className="eyebrow">Modelo de contratação</p><h2>Locação e produção podem ser pensadas juntas.</h2></Reveal><Reveal className="large-copy"><p>A proposta é construída conforme formato, público, data, áreas utilizadas, montagem, equipe, operação audiovisual e responsabilidades. Cada projeto passa por briefing e avaliação de viabilidade.</p><strong>O espaço abre possibilidades. O planejamento transforma possibilidade em execução.</strong></Reveal></div></section>
      <RelatedJourneys items={relatedJourneys.haras} title="Conecte a locação à entrega que o projeto exige." />
      <ContactSection defaultProject="Haras SOBI" title="Vamos desenhar sua produção no Haras SOBI." />
    </main><Footer /></>
  );
}

function ProductPage({ type }: { type: "live" | "legacy" }) {
  const live = type === "live";
  const data = live ? {
    pageTitle: "Leilão 360 | Transmissão de leilão ao vivo, aquecimento e pós-evento",
    description: "Conteúdo de aquecimento, transmissão dirigida e melhores momentos em uma única operação. AR1 Films, Goiânia - GO.",
    eyebrow: "Leilão 360",
    title: "O leilão começa antes do primeiro lote e continua depois do último.",
    summary: "Conteúdo de aquecimento, transmissão dirigida e entregas posteriores organizados em uma operação única.",
    image: "/media/event-stage.webp",
    project: "Leilão 360",
    points: ["Aquecimento e agenda de conteúdo", "Planejamento e transmissão dirigida", "Melhores momentos e ativos posteriores"],
    storyTitle: "Presença em toda a jornada do evento.",
    story: "A operação é dimensionada para o formato do leilão, os canais, o público e os conteúdos que precisam continuar circulando.",
    storyImage: "/media/camera-auction.webp",
  } : {
    pageTitle: "Filme de Legado | Documentário de memória empresarial e familiar",
    description: "Pesquisa, entrevistas e direção para preservar a história de empresas, famílias e territórios. AR1 Films.",
    eyebrow: "Filme de Legado",
    title: "Histórias importantes não podem depender apenas da memória.",
    summary: "Pesquisa, roteiro e produção audiovisual para preservar patrimônio, identidade e visão através das gerações.",
    image: "/media/horse.webp",
    project: "Filme de marca ou legado",
    points: ["Pesquisa e escuta da história", "Roteiro e captação dirigida", "Filme final para acervo, eventos e relacionamento"],
    storyTitle: "Não é apenas registro. É patrimônio.",
    story: "Memória oral, imagens, território e documentos ganham uma narrativa capaz de permanecer com a família e com a marca.",
    storyImage: "/media/cattle-wide.webp",
  };
  usePageMeta(data.pageTitle, data.description);
  return <><Header /><main id="conteudo"><PageHero eyebrow={data.eyebrow} title={data.title} summary={data.summary} image={data.image} breadcrumbs={[{ label: "Soluções", href: "/solucoes" }, { label: data.eyebrow }]} /><section className="product-value section-light"><div className="page-shell"><Reveal><p className="eyebrow">O que organiza</p><h2>Uma entrega pensada como ativo.</h2></Reveal><div className="value-grid">{data.points.map((point, index) => <Reveal className="value-card" key={point}><span>{String(index + 1).padStart(2, "0")}</span><p>{point}</p></Reveal>)}</div></div></section><section className="product-story section-dark"><div className="page-shell media-split"><img src={data.storyImage} alt="Produção AR1 Films" loading="lazy" /><Reveal><p className="eyebrow">Visão do projeto</p><h2>{data.storyTitle}</h2><p>{data.story}</p></Reveal></div></section><RelatedJourneys items={live ? relatedJourneys.live : relatedJourneys.legacy} /><ContactSection defaultProject={data.project} /></main><Footer /></>;
}

function LegacyServicePage({ slug }: { slug: string }) {
  const data = legacyServiceDetails.find((service) => service.slug === slug);
  usePageMeta(data ? `${data.title} | AR1 Films` : "Página não encontrada | AR1 Films", data?.summary ?? "Este endereço não corresponde a uma página da AR1 Films.");
  if (!data) return <NotFound />;
  const related = [
    { label: "Visão completa", title: "Soluções AR1", body: "Entenda como esta capacidade se combina com operação de conteúdo, estrutura e projetos especiais.", href: "/solucoes" },
    { label: "Como executamos", title: "Método AR1", body: "Veja como objetivo, responsabilidades, estrutura e uso orientam cada projeto.", href: "/metodo" },
    { label: "Projeto de escala", title: "Haras SOBI", body: "Conheça uma das principais plataformas da AR1 para gravações, eventos e experiências.", href: "/haras-sobi" },
  ] as const;
  return <><Header /><main id="conteudo"><PageHero eyebrow={data.eyebrow} title={data.title} summary={data.summary} image={data.image} breadcrumbs={[{ label: "Soluções", href: "/solucoes" }, { label: data.title }]} /><section className="legacy-capability section-light"><div className="page-shell split"><Reveal><p className="eyebrow">Capacidade integrada</p><h2>Esta frente faz parte da arquitetura AR1.</h2><p className="section-intro dark">A solução é combinada com estratégia, estrutura e produção conforme o contexto.</p><a className="text-link" href="/solucoes">Ver arquitetura de soluções</a></Reveal><div className="capability-list">{data.items.map((item, index) => <Reveal className="capability-row" key={item}><span>{String(index + 1).padStart(2, "0")}</span><p>{item}</p></Reveal>)}</div></div></section><RelatedJourneys items={related} /><ContactSection defaultProject={data.project} /></main><Footer /></>;
}

function RedirectPage({ to }: { to: string }) {
  useEffect(() => { window.location.replace(to); }, [to]);
  return <><Header /><main id="conteudo" className="not-found section-dark"><div className="page-shell"><p className="eyebrow">Redirecionando</p><h1>Este conteúdo ganhou uma página mais completa.</h1><p>Você será levado ao endereço atualizado.</p><a className="button primary" href={to}>Continuar</a></div></main><Footer /></>;
}

function NotFound() {
  usePageMeta("Página não encontrada | AR1 Films", "Este endereço não corresponde a uma página da AR1 Films.");
  return <><Header /><main id="conteudo" className="not-found section-dark"><div className="page-shell"><p className="eyebrow">Página não encontrada</p><h1>Vamos encontrar o próximo caminho.</h1><p>Este endereço não corresponde a uma página da AR1 Films.</p><a className="button primary" href="/">Voltar ao início</a></div></main><Footer /></>;
}

function App() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  useAnalyticsAndSchema();

  let page: ReactNode = <NotFound />;
  if (path === "/") page = <Home />;
  else if (path === "/podcast") page = <PodcastPage />;
  else if (path === "/solucoes") page = <SolutionsPage />;
  else if (path === "/consultoria-podcast") page = <ConsultingPage />;
  else if (path === "/metodo") page = <MethodPage />;
  else if (path === "/sobre") page = <AboutPage />;
  else if (path === "/haras-sobi") page = <HarasPage />;
  else if (path === "/leilao-360") page = <ProductPage type="live" />;
  else if (path === "/filme-de-legado") page = <ProductPage type="legacy" />;
  else if (path === "/servicos/consultoria-implantacao-estudios-podcast") page = <RedirectPage to="/consultoria-podcast" />;
  else if (path.startsWith("/servicos/")) page = <LegacyServicePage slug={path.slice("/servicos/".length)} />;
  return <>{page}<WhatsAppFloat interest={pageInterest(path)} /></>;
}

export default App;
