import React, { useState } from "react";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Container,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";

import MetricPage from "./MetricPage";
import LeaderboardPanel from "./LeaderboardPanel";

class PageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || "Unknown rendering error" };
  }

  componentDidCatch(error) {
    // Keep a console trail for browser debugging in production deployments.
    // eslint-disable-next-line no-console
    console.error("Page rendering error:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Alert severity="error" sx={{ mt: 1 }}>
          Failed to render this page section: {this.state.message}
        </Alert>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [pageMode, setPageMode] = useState("leaderboard");

  return (
    <Box>
      <AppBar position="sticky">
        <Toolbar sx={{ display: "flex", justifyContent: "space-between" }}>
          <Typography variant="h6">Ab Initio Annotation Leaderboard and Metric</Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 2.6 }}>
        <Stack spacing={2.1}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.2}>
            <Button
              variant={pageMode === "leaderboard" ? "contained" : "outlined"}
              size="large"
              onClick={() => setPageMode("leaderboard")}
            >
              Leaderboard
            </Button>
            <Button
              variant={pageMode === "metric" ? "contained" : "outlined"}
              size="large"
              onClick={() => setPageMode("metric")}
            >
              Metrics description
            </Button>
          </Stack>

          <PageErrorBoundary key={pageMode}>
            {pageMode === "metric" ? <MetricPage /> : <LeaderboardPanel />}
          </PageErrorBoundary>
        </Stack>
      </Container>
    </Box>
  );
}
