export interface SlideItem {
  id: number;
  badge: string;
  badgeColor: string;
  badgeIcon: string;
  title: string;
  subtitle: string;
  cards: {
    title: string;
    icon: string;
    color: string;
    desc: string;
    stat?: string;
  }[];
  footerText?: string;
}

export const SLIDES_DATA: SlideItem[] = [
  {
    id: 1,
    badge: 'The Factory Problem Today',
    badgeColor: 'rose',
    badgeIcon: 'AlertTriangle',
    title: 'Why Standard Xero Fails Our Printing Operation',
    subtitle: 'Standard cloud accounting is built for retail trading, not multi-component manufacturing with long international supply chains.',
    cards: [
      {
        title: 'Missing BOM Recipes',
        icon: 'Layers',
        color: 'rose',
        desc: 'When sales invoices "5,000 Custom Printed Mugs", Xero treats it as one static item. It cannot decrement the 5,000 ceramic blanks, 10.5L ink, or individual boxes.'
      },
      {
        title: 'Uncounted Floor Scrap',
        icon: 'Trash2',
        color: 'amber',
        desc: 'A 2.5% heat press defect rate means 2,500 ceramic mugs are scrapped on a 100k container. In Xero, that inventory remains as "phantom stock" that doesn\'t exist on the floor.'
      },
      {
        title: '45-Day China Blindspot',
        icon: 'Clock',
        color: 'purple',
        desc: 'If we wait until inventory looks low in Xero to reorder from China, we face 6+ weeks of dead factory floor time—costing tens of thousands in lost client contracts.'
      }
    ]
  },
  {
    id: 2,
    badge: 'The Proposed Solution',
    badgeColor: 'indigo',
    badgeIcon: 'Lightbulb',
    title: 'A Tailored AI Inventory Engine Linked to Xero',
    subtitle: 'Instead of complex $600/month legacy ERP software, we deploy a streamlined engine that connects to Xero via official webhooks.',
    cards: [
      {
        title: 'Instant Invoice Webhook',
        icon: 'Zap',
        color: 'indigo',
        desc: 'Sales reps continue invoicing in Xero with zero workflow disruption. The instant "Approve" is clicked, our app intercepts line items and updates warehouse stocks in milliseconds.'
      },
      {
        title: 'True Landed Cost Economics',
        icon: 'Calculator',
        color: 'emerald',
        desc: 'China factory gate price + ocean container shipping + port tariffs + drayage are blended into exact unit costs to show live gross margin per print job.'
      }
    ],
    footerText: 'Maintains single source of truth in Xero while adding specialized manufacturing logic.'
  },
  {
    id: 3,
    badge: 'The AI Advantage',
    badgeColor: 'blue',
    badgeIcon: 'Bot',
    title: 'Predictive Reordering Instead of Guesswork',
    subtitle: 'Replacing arbitrary static reorder rules with live velocity modeling and ocean transit back-calculation.',
    cards: [
      {
        title: 'Sales Velocity Engine',
        icon: 'TrendingUp',
        color: 'blue',
        desc: 'Learns daily/weekly burn rate across corporate gifts and retail orders, automatically detecting peak seasonal surges before human operators notice.'
      },
      {
        title: 'Lead Time Dynamic Buffer',
        icon: 'Clock',
        color: 'amber',
        desc: 'Back-calculates ocean transit days from Shenzhen to factory door. Alerts leadership precisely when PO must be issued to land before stockout.'
      },
      {
        title: 'Proactive Executive Alerts',
        icon: 'Bell',
        color: 'emerald',
        desc: 'Automated warnings sent to CEO: "Issue China PO #PO-8821 by Oct 12th to maintain 10k safety buffer." Zero surprise stock shortages.'
      }
    ]
  },
  {
    id: 4,
    badge: 'CEO Financial ROI',
    badgeColor: 'emerald',
    badgeIcon: 'Coins',
    title: 'Financial Impact & Working Capital Optimization',
    subtitle: 'Transforming inventory from a cash-draining liability into a lean, predictable profit driver.',
    cards: [
      {
        title: 'Working Capital Unlocked',
        icon: 'Wallet',
        color: 'emerald',
        stat: '$35,000+',
        desc: 'Prevents blind over-ordering and holding unneeded surplus containers in costly warehouse pallet racking.'
      },
      {
        title: 'Weekly Staff Time Saved',
        icon: 'CheckCircle2',
        color: 'blue',
        stat: '15 hrs/wk',
        desc: 'Eliminates manual warehouse physical counts, spreadsheet reconciliation, and double-entry between Xero and production.'
      },
      {
        title: 'Order Fulfillment Rate',
        icon: 'ShieldCheck',
        color: 'indigo',
        stat: '100%',
        desc: 'Never tell a high-margin corporate client "we ran out of blank mugs" again. Protects client trust and repeat business.'
      }
    ]
  },
  {
    id: 5,
    badge: 'Implementation Plan',
    badgeColor: 'purple',
    badgeIcon: 'Calendar',
    title: '8-Week Fast-Track Execution Roadmap',
    subtitle: 'Phased rollout with minimal operational downtime and rapid time-to-value.',
    cards: [
      {
        title: 'Weeks 1–2: Xero API & Webhooks',
        icon: 'Zap',
        color: 'indigo',
        desc: 'OAuth 2.0 connection, Webhook listener for approved invoices, inventory database setup.'
      },
      {
        title: 'Weeks 3–4: BOM & Scrap Logic',
        icon: 'Layers',
        color: 'indigo',
        desc: 'Custom mug recipe builder, floor scrap logging, landed cost calculation engine.'
      },
      {
        title: 'Weeks 5–6: AI Forecasting Core',
        icon: 'Bot',
        color: 'indigo',
        desc: 'Burn-rate calculation, China sea transit lead-time alert triggers, predictive reordering.'
      },
      {
        title: 'Weeks 7–8: Go-Live & Portal',
        icon: 'CheckCircle2',
        color: 'emerald',
        desc: 'CEO Executive Portal, automated Slack/email alerts, production staff training and rollout.'
      }
    ],
    footerText: 'Next Step: Executive sign-off for Phase 1 prototype and test sandbox integration.'
  }
];
