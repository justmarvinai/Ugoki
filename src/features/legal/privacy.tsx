/**
 * Datenschutzerklärung (docs/02-experience.md §2, ADR-016, ADR-017): the short version first,
 * then the controller, hosting (Vercel's request logs are the only personal data the operator's
 * infrastructure sees), no third-party requests, no cookies, storage on the device, share links,
 * exports, email, rights. German first, then English. Keep it in step with the product: anything
 * that adds a request, a cookie or a stored value must be described here first.
 * Not legal advice — the owner has the final text checked before launch (USER_QUESTIONS O4).
 */

import { LegalPage } from './legal-page';
import { External, List, OperatorAddress, OperatorEmail, Topic } from './prose';

const VERCEL_PRIVACY = 'https://vercel.com/legal/privacy-notice';
const VERCEL_ADDRESS = 'Vercel Inc., 440 N Barranca Avenue #4133, Covina, CA 91723, USA';

export function Privacy() {
  return (
    <LegalPage
      path="/legal/privacy"
      de={{
        // A soft hyphen lets the long word break on phones.
        title: 'Datenschutz­erklärung',
        lead: (
          <p>
            Kurz gesagt: Ugoki setzt keine Cookies, trackt nicht, nutzt keine Analyse-Tools und hat
            keine Konten. Nichts wird hochgeladen – Ihre Designs und Dateien bleiben in Ihrem
            Browser.
          </p>
        ),
        updated: 'Stand: September 2026',
        children: <German />,
      }}
      en={{
        title: 'Privacy policy',
        lead: (
          <p>
            In short: Ugoki sets no cookies, doesn’t track you, runs no analytics and has no
            accounts. Nothing is uploaded — your designs and files stay in your browser.
          </p>
        ),
        updated: 'Last updated: September 2026',
        note: 'This translation is for your convenience; the German version is authoritative.',
        children: <English />,
      }}
    />
  );
}

function German() {
  return (
    <>
      <Topic title="Verantwortlicher">
        <p>
          Verantwortlich für die Verarbeitung personenbezogener Daten auf dieser Website im Sinne
          der Datenschutz-Grundverordnung (DSGVO) ist:
        </p>
        <OperatorAddress lang="de" />
        <p>
          E-Mail: <OperatorEmail />
        </p>
      </Topic>

      <Topic title="Hosting durch Vercel">
        <p>
          Diese Website wird von {VERCEL_ADDRESS}, bereitgestellt. Wenn Sie die Website aufrufen,
          verarbeitet Vercel die Daten, die Ihr Browser dabei automatisch übermittelt
          (Server-Logdaten):
        </p>
        <List>
          <li>IP-Adresse,</li>
          <li>Datum und Uhrzeit des Abrufs,</li>
          <li>aufgerufene Adresse (URL),</li>
          <li>User-Agent (Browser und Betriebssystem),</li>
          <li>Referrer (die zuvor besuchte Seite, falls übermittelt).</li>
        </List>
        <p>
          Diese Daten werden verarbeitet, um die Website auszuliefern und ihre Sicherheit und
          Stabilität zu gewährleisten, etwa um Angriffe abzuwehren. Rechtsgrundlage ist Art.&nbsp;6
          Abs.&nbsp;1 lit.&nbsp;f DSGVO; das berechtigte Interesse liegt in einer sicheren und
          zuverlässigen Bereitstellung der Website. Die Daten werden gelöscht, sobald sie für diese
          Zwecke nicht mehr erforderlich sind.
        </p>
        <p>
          Vercel verarbeitet diese Daten als Auftragsverarbeiter im Auftrag des Betreibers
          (Art.&nbsp;28 DSGVO). Dabei können Daten in die USA übermittelt werden. Vercel ist nach
          dem EU-U.S. Data Privacy Framework zertifiziert, für das ein Angemessenheitsbeschluss der
          Europäischen Kommission besteht (Art.&nbsp;45 DSGVO); zusätzlich stützt Vercel
          Übermittlungen auf Standardvertragsklauseln der Europäischen Kommission (Art.&nbsp;46
          Abs.&nbsp;2 lit.&nbsp;c DSGVO). Mehr dazu in den{' '}
          <External href={VERCEL_PRIVACY}>Datenschutzhinweisen von Vercel</External>.
        </p>
        <p>Die Verbindung zu dieser Website ist verschlüsselt (TLS).</p>
      </Topic>

      <Topic title="Keine Anfragen an Dritte">
        <p>
          Alles, was diese Website braucht – Schriften, Skripte und WebAssembly-Module –, wird von
          ihr selbst ausgeliefert. Ihr Browser stellt beim Besuch keine Anfragen an Dritte: keine
          externen Schriftdienste, keine Skripte von Drittanbietern, keine eingebetteten Inhalte.
        </p>
      </Topic>

      <Topic title="Keine Cookies, kein Tracking">
        <p>
          Ugoki setzt keine Cookies und verwendet keine Analyse-, Tracking- oder
          Fehlerüberwachungsdienste. Deshalb gibt es auch keinen Cookie-Banner: Es gibt nichts, dem
          Sie zustimmen müssten.
        </p>
      </Topic>

      <Topic title="Speicherung auf Ihrem Gerät">
        <p>
          Damit Sie dort weitermachen können, wo Sie aufgehört haben, speichert Ugoki Daten
          ausschließlich lokal in Ihrem Browser:
        </p>
        <List>
          <li>
            Entwürfe und die Bilder, die Sie verwenden – im IndexedDB-Speicher Ihres Browsers,
          </li>
          <li>
            kleine Einstellungen, etwa die Überschrift, die Sie in der Galerie eingeben – im
            sessionStorage oder localStorage.
          </li>
        </List>
        <p>
          Diese Daten werden nie an den Server oder an Dritte übertragen; der Betreiber hat keinen
          Zugriff darauf. Die Speicherung ist für die Funktionen erforderlich, die Sie nutzen
          (§&nbsp;25 Abs.&nbsp;2 Nr.&nbsp;2 TDDDG). Löschen können Sie die Daten jederzeit, indem
          Sie in den Einstellungen Ihres Browsers die Websitedaten dieser Website löschen.
        </p>
      </Topic>

      <Topic title="Links zum Teilen">
        <p>
          Wenn Sie ein Design teilen, steht es im Link im Teil der Adresse nach dem Zeichen „#“.
          Diesen Teil senden Browser nicht an den Server: Das Design wird erst auf dem Gerät der
          Person gelesen, die den Link öffnet. Bilder sind in Links nicht enthalten.
        </p>
      </Topic>

      <Topic title="Exporte">
        <p>
          Videos, GIFs und Bilder erzeugt Ugoki vollständig in Ihrem Browser und speichert sie
          direkt auf Ihrem Gerät. Nichts davon wird hochgeladen.
        </p>
      </Topic>

      <Topic title="Kontakt per E-Mail">
        <p>
          Wenn Sie per E-Mail Kontakt aufnehmen, werden Ihre Angaben (etwa Ihre E-Mail-Adresse, Ihr
          Name und der Inhalt Ihrer Nachricht) verarbeitet, um Ihre Anfrage zu beantworten.
          Rechtsgrundlage ist Art.&nbsp;6 Abs.&nbsp;1 lit.&nbsp;f DSGVO; das berechtigte Interesse
          liegt in der Beantwortung Ihrer Anfrage. Die Daten werden gelöscht, sobald sie dafür nicht
          mehr benötigt werden und keine gesetzlichen Aufbewahrungspflichten entgegenstehen.
        </p>
      </Topic>

      <Topic title="Ihre Rechte">
        <p>Nach der DSGVO haben Sie das Recht auf</p>
        <List>
          <li>Auskunft über die Sie betreffenden Daten (Art.&nbsp;15 DSGVO),</li>
          <li>Berichtigung (Art.&nbsp;16 DSGVO),</li>
          <li>Löschung (Art.&nbsp;17 DSGVO),</li>
          <li>Einschränkung der Verarbeitung (Art.&nbsp;18 DSGVO),</li>
          <li>Datenübertragbarkeit (Art.&nbsp;20 DSGVO) und</li>
          <li>Widerspruch gegen die Verarbeitung (Art.&nbsp;21 DSGVO).</li>
        </List>
        <p>
          Beruht eine Verarbeitung auf Art.&nbsp;6 Abs.&nbsp;1 lit.&nbsp;f DSGVO, können Sie ihr aus
          Gründen, die sich aus Ihrer besonderen Situation ergeben, jederzeit widersprechen. Eine
          E-Mail an den Verantwortlichen genügt.
        </p>
        <p>
          Außerdem haben Sie das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren
          (Art.&nbsp;77 DSGVO), insbesondere in dem Mitgliedstaat Ihres Aufenthaltsorts, Ihres
          Arbeitsplatzes oder des Orts des mutmaßlichen Verstoßes.
        </p>
      </Topic>

      <Topic title="Keine automatisierte Entscheidungsfindung">
        <p>
          Eine automatisierte Entscheidungsfindung einschließlich Profiling (Art.&nbsp;22 DSGVO)
          findet nicht statt.
        </p>
      </Topic>

      <Topic title="Änderungen dieser Datenschutzerklärung">
        <p>
          Diese Datenschutzerklärung wird angepasst, wenn sich Ugoki oder die Rechtslage ändert. Es
          gilt die jeweils auf dieser Seite veröffentlichte Fassung.
        </p>
      </Topic>
    </>
  );
}

function English() {
  return (
    <>
      <Topic level={3} title="Controller">
        <p>
          The controller responsible for processing personal data on this website under the General
          Data Protection Regulation (GDPR) is:
        </p>
        <OperatorAddress lang="en" />
        <p>
          Email: <OperatorEmail />
        </p>
      </Topic>

      <Topic level={3} title="Hosting by Vercel">
        <p>
          This website is served by {VERCEL_ADDRESS}. When you visit it, Vercel processes the data
          your browser sends automatically (server log data):
        </p>
        <List>
          <li>IP address,</li>
          <li>date and time of the request,</li>
          <li>the requested address (URL),</li>
          <li>user agent (browser and operating system),</li>
          <li>referrer (the page you came from, if sent).</li>
        </List>
        <p>
          This data is processed to deliver the website and keep it secure and stable — for example,
          to fend off attacks. The legal basis is Art.&nbsp;6(1)(f) GDPR; the legitimate interest is
          delivering the website securely and reliably. The data is deleted once it is no longer
          needed for these purposes.
        </p>
        <p>
          Vercel processes this data as a processor on the operator’s behalf (Art.&nbsp;28 GDPR).
          Data may be transferred to the USA. Vercel is certified under the EU–U.S. Data Privacy
          Framework, which is covered by an adequacy decision of the European Commission
          (Art.&nbsp;45 GDPR); Vercel also relies on the Commission’s standard contractual clauses
          (Art.&nbsp;46(2)(c) GDPR). More in{' '}
          <External href={VERCEL_PRIVACY}>Vercel’s privacy notice</External>.
        </p>
        <p>Connections to this website are encrypted (TLS).</p>
      </Topic>

      <Topic level={3} title="No third-party requests">
        <p>
          Everything this website needs — fonts, scripts and WebAssembly modules — is served by the
          site itself. Your browser makes no requests to third parties: no external font services,
          no third-party scripts, no embedded content.
        </p>
      </Topic>

      <Topic level={3} title="No cookies, no tracking">
        <p>
          Ugoki sets no cookies and uses no analytics, tracking or error-monitoring services. That’s
          why there’s no cookie banner: there’s nothing to consent to.
        </p>
      </Topic>

      <Topic level={3} title="Storage on your device">
        <p>So you can pick up where you left off, Ugoki stores data only in your browser:</p>
        <List>
          <li>drafts and the images you use — in your browser’s IndexedDB storage,</li>
          <li>
            small preferences, such as the headline you type in the gallery — in sessionStorage or
            localStorage.
          </li>
        </List>
        <p>
          This data is never sent to the server or to anyone else; the operator has no access to it.
          Storing it is necessary for the features you use (§&nbsp;25(2) no.&nbsp;2 TDDDG, the
          German Telecommunications Digital Services Data Protection Act). You can delete it at any
          time by clearing this site’s data in your browser settings.
        </p>
      </Topic>

      <Topic level={3} title="Share links">
        <p>
          When you share a design, the link carries it in the part of the address after the “#”
          sign. Browsers don’t send this part to the server: the design is read only on the device
          of the person who opens the link. Images are not included in links.
        </p>
      </Topic>

      <Topic level={3} title="Exports">
        <p>
          Ugoki makes videos, GIFs and images entirely in your browser and saves them straight to
          your device. None of it is uploaded.
        </p>
      </Topic>

      <Topic level={3} title="Contacting by email">
        <p>
          If you contact the operator by email, your details (such as your email address, name and
          message) are processed to answer your request. The legal basis is Art.&nbsp;6(1)(f) GDPR;
          the legitimate interest is answering your request. The data is deleted once it is no
          longer needed for this and no statutory retention obligations apply.
        </p>
      </Topic>

      <Topic level={3} title="Your rights">
        <p>Under the GDPR, you have the right to</p>
        <List>
          <li>access the data concerning you (Art.&nbsp;15 GDPR),</li>
          <li>have it corrected (Art.&nbsp;16 GDPR),</li>
          <li>have it erased (Art.&nbsp;17 GDPR),</li>
          <li>restrict its processing (Art.&nbsp;18 GDPR),</li>
          <li>receive it in a portable format (Art.&nbsp;20 GDPR) and</li>
          <li>object to its processing (Art.&nbsp;21 GDPR).</li>
        </List>
        <p>
          Where processing is based on Art.&nbsp;6(1)(f) GDPR, you can object to it at any time on
          grounds relating to your particular situation. An email to the controller is enough.
        </p>
        <p>
          You also have the right to lodge a complaint with a data protection supervisory authority
          (Art.&nbsp;77 GDPR), in particular in the member state of your habitual residence, your
          place of work or the place of the alleged infringement.
        </p>
      </Topic>

      <Topic level={3} title="No automated decision-making">
        <p>There is no automated decision-making, including profiling (Art.&nbsp;22 GDPR).</p>
      </Topic>

      <Topic level={3} title="Changes to this policy">
        <p>
          This policy is updated when Ugoki or the law changes. The version published on this page
          applies.
        </p>
      </Topic>
    </>
  );
}
