// @polsia:user-owned — Dayweft public home; the assistant is still being built.
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CircleHelp,
  ListTodo,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { AuthNav } from '@/components/custom/auth-nav';
import { ConceptScene, ConceptStory } from '@/components/custom/motion-kit/concept-story';
import { DocumentAssemble } from '@/components/custom/motion-kit/document-assemble';
import { GradientField } from '@/components/custom/motion-kit/gradient-field';
import { MotionKitProvider } from '@/components/custom/motion-kit/motion-kit-provider';
import { NotificationStream } from '@/components/custom/motion-kit/notification-stream';
import { SpotlightCard, SpotlightGrid } from '@/components/custom/motion-kit/spotlight-grid';
import { Surface } from '@/components/custom/motion-kit/surface';
import { TerminalReplay } from '@/components/custom/motion-kit/terminal-replay';
import { WordRotate } from '@/components/custom/motion-kit/word-rotate';
import { Button } from '@/components/ui/button';
import styles from './dayweft-landing.module.css';

function DayweftMark() {
  return (
    <svg aria-hidden="true" className={styles.mark} viewBox="0 0 36 36" fill="none">
      <path
        d="M7 12.1h13.6a6.4 6.4 0 0 1 0 12.8H15a6.4 6.4 0 0 1-6.4-6.4v-5.2"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path
        d="M29 23.9H15.4a6.4 6.4 0 0 1 0-12.8H21a6.4 6.4 0 0 1 6.4 6.4v5.2"
        stroke="var(--dayweft-evergreen)"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Wordmark() {
  return (
    <Link href="#top" className={styles.wordmark} aria-label="Dayweft home">
      <DayweftMark />
      <span>dayweft</span>
    </Link>
  );
}

function FeatureIcon({ children }: { children: ReactNode }) {
  return <span className={styles.featureIcon}>{children}</span>;
}

function EverydayVignette() {
  return (
    <fieldset className={styles.vignette}>
      <legend className="sr-only">An everyday planning example</legend>
      <div className={styles.vignetteTop}>
        <span className={styles.vignetteMark} aria-hidden="true">
          <Sparkles size={15} strokeWidth={1.8} />
        </span>
        <p>A day, with a little more room</p>
        <span className={styles.vignetteDate}>A DAY IN VIEW</span>
      </div>

      <div className={styles.vignetteNotes}>
        <article className={`${styles.note} ${styles.questionNote}`}>
          <span className={styles.noteLabel}>A QUESTION</span>
          <p>What can I make with what’s already at home?</p>
          <CircleHelp size={18} aria-hidden="true" />
        </article>
        <article className={`${styles.note} ${styles.planNote}`}>
          <span className={styles.noteLabel}>A PLAN</span>
          <p>Keep Saturday simple, with space to reset.</p>
          <CalendarDays size={18} aria-hidden="true" />
        </article>
        <article className={`${styles.note} ${styles.taskNote}`}>
          <span className={styles.noteLabel}>A SMALL TASK</span>
          <p>Remember the note you meant to send.</p>
          <ListTodo size={18} aria-hidden="true" />
        </article>
      </div>

      <div className={styles.vignetteFoot}>
        <span className={styles.footCheck} aria-hidden="true">
          <Check size={15} strokeWidth={2.5} />
        </span>
        <div>
          <span className={styles.footLabel}>THE NEXT STEP</span>
          <p>Start with the one thing that matters now.</p>
        </div>
        <ArrowDownRight size={18} aria-hidden="true" />
      </div>
      <p className={styles.vignetteCaption}>
        The kind of everyday help Dayweft is being built for.
      </p>
    </fieldset>
  );
}

export function DayweftLanding() {
  return (
    <MotionKitProvider>
      <main className={styles.page} id="top">
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <Wordmark />
            <nav className={styles.nav} aria-label="Main navigation">
              <Link href="#how-it-helps">What it helps with</Link>
              <Link href="#a-day-with-dayweft">A day with Dayweft</Link>
              <Link href="#the-free-five-day-trial">The five-day trial</Link>
            </nav>
            <AuthNav />
          </div>
        </header>

        <section className={styles.hero} aria-labelledby="hero-title">
          <GradientField
            className={styles.heroField}
            contentClassName={styles.heroFieldContent}
            background="#ffffff"
            colors={['#7eabff', '#83c4aa', '#abc5ff']}
            intensity={0.48}
            speed={0.8}
            grain
          >
            <div className={styles.container}>
              <div className={styles.heroGrid}>
                <div className={styles.heroCopy}>
                  <p className={styles.eyebrow}>
                    <span className={styles.eyebrowDot} aria-hidden="true" />A more helpful AI
                    assistant for everyday life
                  </p>
                  <h1 id="hero-title">
                    One helpful place for{' '}
                    <WordRotate
                      words={['questions', 'plans', 'small tasks']}
                      interval={3.2}
                      color="var(--primary)"
                    />
                    .
                  </h1>
                  <p className={styles.heroText}>
                    Dayweft is being built to bring everyday questions, planning, and small tasks
                    into one clear conversation.
                  </p>
                  <div className={styles.heroActions}>
                    <Button asChild className={styles.primaryCta}>
                      <Link href="/signup">
                        Start your five-day trial <ArrowUpRight size={17} aria-hidden="true" />
                      </Link>
                    </Button>
                    <Link href="#how-it-helps" className={styles.textLink}>
                      See what it could help with <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                  </div>
                  <p className={styles.mailNote}>
                    Create a personal account in less than a minute.
                  </p>
                </div>
                <div className={styles.heroVisual}>
                  <EverydayVignette />
                </div>
              </div>
            </div>
          </GradientField>
        </section>

        <section className={styles.helpSection} id="how-it-helps" aria-labelledby="help-title">
          <div className={styles.container}>
            <div className={styles.sectionIntro}>
              <p className={styles.sectionEyebrow}>MADE FOR THE SHAPE OF A REAL DAY</p>
              <h2 id="help-title">The little things deserve a helpful place.</h2>
              <p>Dayweft is taking shape around the everyday moments that rarely fit in one app.</p>
            </div>
            <SpotlightGrid
              className={styles.featureGrid}
              columns={3}
              radius={260}
              color="#7eabff"
              stagger={0.06}
            >
              <SpotlightCard
                className={styles.featureCard}
                span={1}
                icon={
                  <FeatureIcon>
                    <CircleHelp size={19} strokeWidth={1.8} />
                  </FeatureIcon>
                }
                title="Think something through"
                description="Get help with an everyday question, from a quick answer to a decision that needs a little more thought."
                visual={
                  <span className={styles.featureWord}>
                    Ask freely<span>?</span>
                  </span>
                }
                visualClassName={styles.featureVisual}
              />
              <SpotlightCard
                className={styles.featureCard}
                span={1}
                icon={
                  <FeatureIcon>
                    <CalendarDays size={19} strokeWidth={1.8} />
                  </FeatureIcon>
                }
                title="Make a plan that fits"
                description="Turn a loose idea into a few clear next steps, with room for the day to change."
                visual={
                  <span className={`${styles.featureWord} ${styles.planWord}`}>
                    A softer plan<span>↗</span>
                  </span>
                }
                visualClassName={styles.featureVisual}
              />
              <SpotlightCard
                className={styles.featureCard}
                span={1}
                icon={
                  <FeatureIcon>
                    <ListTodo size={19} strokeWidth={1.8} />
                  </FeatureIcon>
                }
                title="Keep small tasks close"
                description="Hold reminders and follow-ups near the questions and plans they belong with."
                visual={
                  <span className={`${styles.featureWord} ${styles.taskWord}`}>
                    One next step<span>✓</span>
                  </span>
                }
                visualClassName={styles.featureVisual}
              />
            </SpotlightGrid>

            <div className={styles.inlineOffer}>
              <div>
                <p className={styles.offerEyebrow}>TRY DAYWEFT FREE FOR FIVE DAYS</p>
                <h3>A little help could make a difference.</h3>
                <p>Create a personal account and start your five-day free trial.</p>
              </div>
              <Button asChild className={styles.offerCta}>
                <Link href="/signup">
                  Create an account <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <section
          className={styles.storySection}
          id="a-day-with-dayweft"
          aria-labelledby="story-title"
        >
          <div className={styles.container}>
            <div className={styles.storyIntro}>
              <p className={styles.sectionEyebrow}>A DAY, MADE A LITTLE CLEARER</p>
              <h2 id="story-title">From a loose thought to a next step.</h2>
              <p>One small example of the kind of help Dayweft is being built to offer.</p>
            </div>
            <ConceptStory
              id="dayweft-story"
              layout="split"
              scrollLength="390vh"
              mobileScrollLength="285vh"
              topOffset="3rem"
              maxWidth="74rem"
              acts={[
                {
                  eyebrow: '01 · THE BEFORE',
                  title: 'The day starts in fragments.',
                  body: 'A quick question, a half-made plan, a task you do not want to forget. They matter, but they arrive at different times.',
                },
                {
                  eyebrow: '02 · THE TURN',
                  title: 'A request can become a useful next step.',
                  body: 'Ask in your own words. Dayweft is being built to shape that into an answer or a plan you can adjust.',
                },
                {
                  eyebrow: '03 · THE AFTER',
                  title: 'Keep the next step within reach.',
                  body: 'A helpful plan leaves room for real life, so one small task feels clear and the rest can wait.',
                },
              ]}
              stage={
                <div className={styles.storyStage}>
                  <ConceptScene show={[0, 0.34]}>
                    <NotificationStream
                      layout="split"
                      title="On your mind"
                      resolutionLabel="One place to begin"
                      range={[0.035, 0.305]}
                      items={[
                        {
                          title: 'What can I make with what is at home?',
                          meta: 'Everyday question',
                        },
                        { title: 'Keep Saturday open for a reset', meta: 'A plan taking shape' },
                        { title: 'Remember the note you meant to send', meta: 'A small task' },
                        { title: 'Find a moment to think it through', meta: 'When there is room' },
                      ]}
                      stageClassName={styles.storyPrimitive}
                    />
                  </ConceptScene>
                  <ConceptScene show={[0.34, 0.67]}>
                    <Surface
                      as="div"
                      background="#f2f6fd"
                      tone="light"
                      style={
                        { '--background': '#f2f6fd', '--foreground': '#17243a' } as CSSProperties
                      }
                      className={styles.terminalSurface}
                    >
                      <TerminalReplay
                        layout="split"
                        title="A possible exchange"
                        prompt="You"
                        command="Plan a gentle Saturday"
                        lines={[
                          'Keep the meal simple.',
                          'Check what is already at home.',
                          'Choose what is missing.',
                          'Leave the afternoon open.',
                        ]}
                        status="Plan ready · easy to adjust"
                        range={[0.375, 0.635]}
                        stageClassName={styles.storyPrimitive}
                      />
                    </Surface>
                  </ConceptScene>
                  <ConceptScene show={[0.67, 1]}>
                    <DocumentAssemble
                      layout="split"
                      title="A plan that breathes"
                      subtitle="Keep the useful bits, leave room"
                      fields={[
                        { label: 'Keep it simple', value: 'Choose one easy meal' },
                        { label: 'Before you go', value: 'Check what is already at home' },
                        { label: 'Leave room', value: 'Keep the afternoon open' },
                      ]}
                      stamp="Ready"
                      stampCaption="A starting point, not a schedule"
                      range={[0.705, 0.96]}
                      stageClassName={styles.storyPrimitive}
                    />
                  </ConceptScene>
                </div>
              }
              stageClassName={styles.storyFrame}
            />
          </div>
        </section>

        <Surface
          as="section"
          id="the-free-five-day-trial"
          background="#eaf1ff"
          tone="light"
          className={styles.trialSection}
        >
          <div className={styles.trialInner}>
            <p className={styles.trialEyebrow}>
              A MORE HELPFUL FIVE DAYS, STARTING WITH A CONVERSATION
            </p>
            <h2>Try Dayweft free for five days.</h2>
            <p>
              Start with a personal account. Your five-day free trial is saved to it automatically.
            </p>
            <Button asChild className={styles.trialCta}>
              <Link href="/signup">
                Start the five-day trial <ArrowUpRight size={17} aria-hidden="true" />
              </Link>
            </Button>
            <a className={styles.emailLink} href="mailto:dayweft-2h2yxf@polsia.app">
              dayweft-2h2yxf@polsia.app
            </a>
          </div>
        </Surface>

        <footer className={styles.footer}>
          <div className={styles.footerInner}>
            <Wordmark />
            <p>A more helpful AI assistant for everyday life.</p>
            <a href="mailto:dayweft-2h2yxf@polsia.app">Contact Dayweft</a>
            <span>© Dayweft</span>
          </div>
        </footer>
      </main>
    </MotionKitProvider>
  );
}
