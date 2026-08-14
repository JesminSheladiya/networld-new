import { useState } from "react";
import { Form, Input, Button, Card, message, Typography } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { login } from "../Services/authService";

const { Title } = Typography;

function Login({ onLoginSuccess, onSwitchForm }) {
  const [loading, setLoading] = useState(false);

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const data = await login(values.identifier, values.password);
      message.success(`Welcome, ${data.username}!`);
      onLoginSuccess();
    } catch (error) {
      message.error(
        error.response?.data?.error ||
        error.response?.data?.message ||
        "Login failed!"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page" style={{
      display: "flex", justifyContent: "center",
      alignItems: "center", height: "100vh", background: "#141414"
    }}>
      <Card className="login-card"
        style={{
          width: 400,
          background: "linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.8) 100%)",
          border: "1px solid rgba(59, 130, 246, 0.25)",
          borderRadius: 16,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}
        styles={{ body: { padding: "32px 28px" } }}
      >
        <Title className="login-title" level={2} style={{ textAlign: "center", marginBottom: 30, color: "#f1f5f9" }}>
          Net World Login
        </Title>

        <Form className="login-form" name="login" onFinish={onFinish} autoComplete="off" layout="vertical">

          <Form.Item className="login-field" name="identifier"
            rules={[{ required: true, message: "Please enter email or phone!" }]}>
            <Input className="login-input"
              prefix={<UserOutlined style={{ color: "#38bdf8" }} />}
              placeholder="Email / Phone"
              size="large"
            />
          </Form.Item>

          <Form.Item className="login-field" name="password"
            rules={[{ required: true, message: "Please enter password!" }]}>
            <Input.Password className="login-input" prefix={<LockOutlined style={{ color: "#38bdf8" }} />}
              placeholder="Password" size="large" />
          </Form.Item>

          <Form.Item className="login-field">
            <Button className="login-btn" type="primary" htmlType="submit"
              loading={loading} block size="large">
              Login
            </Button>
          </Form.Item>
        </Form>

        <div className="login-footer" style={{ textAlign: "center", marginTop: 16 }}>
          <Typography.Text className="login-footer-text" style={{ color: "#94a3b8" }}>
            Don't have an account?{" "}
            <a className="login-switch-link" onClick={onSwitchForm} style={{ cursor: "pointer", color: "#38bdf8", fontWeight: 600 }}>
              Register here
            </a>
          </Typography.Text>
        </div>
      </Card>
    </div>
  );
}

export default Login;