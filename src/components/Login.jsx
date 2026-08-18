import { useState } from "react";
import { Form, Input, Button, Card, message, Typography } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { login } from "../Services/authService";
import "./css/Auth.css";

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
    <div className="auth-page">
      <div className="auth-glow auth-glow-1" />
      <div className="auth-glow auth-glow-2" />

      <Card className="auth-card auth-card-login">
        <div className="auth-header">
          <div className="auth-logo">N</div>
          <Title className="auth-title" level={2}>
            Net World Login
          </Title>
        </div>

        <Form className="auth-form" name="login" onFinish={onFinish} autoComplete="off" layout="vertical">
          <Form.Item
            className="auth-field"
            name="identifier"
            rules={[{ required: true, message: "Please enter email or phone!" }]}
          >
            <Input
              className="auth-input"
              prefix={<UserOutlined className="auth-input-icon" />}
              placeholder="Email / Phone"
              size="large"
            />
          </Form.Item>

          <Form.Item
            className="auth-field"
            name="password"
            rules={[{ required: true, message: "Please enter password!" }]}
          >
            <Input.Password
              className="auth-input"
              prefix={<LockOutlined className="auth-input-icon" />}
              placeholder="Password"
              size="large"
            />
          </Form.Item>

          <Form.Item className="auth-field auth-submit">
            <Button className="auth-btn" type="primary" htmlType="submit" loading={loading} block size="large">
              Login
            </Button>
          </Form.Item>
        </Form>

        <div className="auth-footer">
          <Typography.Text className="auth-footer-text">
            Don't have an account?{" "}
            <a className="auth-switch-link" onClick={onSwitchForm}>
              Register here
            </a>
          </Typography.Text>
        </div>
      </Card>
    </div>
  );
}

export default Login;