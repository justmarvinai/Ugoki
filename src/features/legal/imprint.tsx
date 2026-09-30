/**
 * Impressum (docs/02-experience.md §2, ADR-017): the operator's details under § 5 DDG (the
 * Digitale-Dienste-Gesetz replaced the TMG in May 2024) and § 18 Abs. 2 MStV. German first,
 * then English. The details come from `operator.ts` (placeholders until the owner fills them in,
 * USER_QUESTIONS O4). Not legal advice — the owner has the final text checked before launch.
 */

import { LegalPage } from './legal-page';
import { OperatorAddress, OperatorEmail, Topic } from './prose';

export function Imprint() {
  return (
    <LegalPage
      path="/legal/imprint"
      de={{
        title: 'Impressum',
        lead: 'Ugoki ist ein privates, nicht-kommerzielles Projekt.',
        children: (
          <>
            <Topic title={'Angaben gemäß §\u00a05 DDG'}>
              <OperatorAddress lang="de" />
            </Topic>
            <Topic title="Kontakt">
              <p>
                E-Mail: <OperatorEmail />
              </p>
            </Topic>
            <Topic title={'Verantwortlich für den Inhalt nach §\u00a018 Abs.\u00a02 MStV'}>
              <OperatorAddress lang="de" />
            </Topic>
          </>
        ),
      }}
      en={{
        title: 'Legal notice',
        lead: 'Ugoki is a private, non-commercial project.',
        note: 'This translation is for your convenience; the German version is authoritative.',
        children: (
          <>
            <Topic
              level={3}
              title={'Information according to §\u00a05 DDG (German Digital Services Act)'}
            >
              <OperatorAddress lang="en" />
            </Topic>
            <Topic level={3} title="Contact">
              <p>
                Email: <OperatorEmail />
              </p>
            </Topic>
            <Topic
              level={3}
              title={
                'Responsible for the content according to §\u00a018(2) MStV (German Interstate Media Treaty)'
              }
            >
              <OperatorAddress lang="en" />
            </Topic>
          </>
        ),
      }}
    />
  );
}
