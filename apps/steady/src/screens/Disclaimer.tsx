import { Button, Card } from "@haunt-kit/ui";

export function Disclaimer({ onAccept }: { onAccept: () => void }) {
  return (
    <Card title="Before you start" level={1}>
      <div className="st-stack">
        <ul className="st-list">
          <li>Steady is not a medical device.</li>
          <li>It gives no medical advice.</li>
          <li>Follow what your therapist or doctor told you.</li>
          <li>Stop if something hurts.</li>
          <li>Your sessions stay on this phone. Nothing is uploaded.</li>
        </ul>
        <div>
          <Button size="large" onClick={onAccept}>
            I understand
          </Button>
        </div>
      </div>
    </Card>
  );
}
